import {
  buildPreviewState,
  drawPreviewImage,
  fallbackMetadata,
  themes,
} from "./preview-card.js";
import { renderPreviewMatrix } from "./preview-matrix.js";

const form = document.querySelector("#inspect-form");
const urlInput = document.querySelector("#github-url");
const titleInput = document.querySelector("#card-title");
const descriptionInput = document.querySelector("#card-description");
const themeInputs = Array.from(document.querySelectorAll('input[name="theme"]'));
const infoInputs = Array.from(document.querySelectorAll('input[name="info-chip"]'));
const createButton = document.querySelector("#create-link");
const statusEl = document.querySelector("#status");
const resultEl = document.querySelector("#result");
const shareUrlInput = document.querySelector("#share-url");
const copyButton = document.querySelector("#copy-link");
const openMatrixButton = document.querySelector("#open-preview-matrix");
const closeMatrixButton = document.querySelector("#close-preview-matrix");
const closeMatrixScrim = document.querySelector("#close-preview-matrix-scrim");
const matrixModal = document.querySelector("#preview-matrix-modal");
const matrix = document.querySelector("#preview-matrix");

const previewCard = document.querySelector("#preview-card");
const previewContext = previewCard.getContext("2d");

let currentMetadata = null;
let activeInspectId = 0;
let hasEditedDescription = false;
let hasEditedTitle = false;
let inspectTimer = 0;
let isApplyingMetadata = false;
let lastInspectedUrl = "";
let hasRenderedMatrix = false;
let matrixReturnFocus = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await inspectUrl({ force: true });
});

urlInput.addEventListener("input", handleUrlInput);
urlInput.addEventListener("paste", () => {
  window.setTimeout(() => scheduleAutoInspect(120), 0);
});

titleInput.addEventListener("input", () => {
  if (!isApplyingMetadata) {
    hasEditedTitle = true;
  }
  renderPreview();
});

descriptionInput.addEventListener("input", () => {
  if (!isApplyingMetadata) {
    hasEditedDescription = true;
  }
  renderPreview();
});

for (const input of [titleInput, descriptionInput, ...themeInputs, ...infoInputs]) {
  input.addEventListener("change", renderPreview);
}

createButton.addEventListener("click", async () => {
  if (!currentMetadata) return;
  await createShareLink();
});

copyButton.addEventListener("click", async () => {
  if (!shareUrlInput.value) return;
  await navigator.clipboard.writeText(shareUrlInput.value);
  setStatus("Copied.");
});

openMatrixButton.addEventListener("click", openPreviewMatrix);
closeMatrixButton.addEventListener("click", closePreviewMatrix);
closeMatrixScrim.addEventListener("click", closePreviewMatrix);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !matrixModal.hidden) {
    closePreviewMatrix();
  }
});

renderPreview();

function handleUrlInput() {
  const normalizedUrl = normalizeGithubUrl(urlInput.value);
  const isNewTarget = normalizedUrl && normalizedUrl !== lastInspectedUrl;
  const shouldReset = !urlInput.value.trim() || isNewTarget || (!normalizedUrl && currentMetadata);
  if (shouldReset) {
    activeInspectId += 1;
    currentMetadata = null;
    createButton.disabled = true;
    resultEl.hidden = true;
    hasEditedDescription = false;
    hasEditedTitle = false;
    if (!normalizedUrl || isNewTarget) {
      titleInput.value = "";
      descriptionInput.value = "";
    }
    if (!urlInput.value.trim()) {
      setStatus("");
    }
    renderPreview();
  }
  scheduleAutoInspect();
}

function scheduleAutoInspect(delay = 650) {
  window.clearTimeout(inspectTimer);
  if (!normalizeGithubUrl(urlInput.value)) {
    return;
  }
  inspectTimer = window.setTimeout(() => {
    inspectUrl();
  }, delay);
}

async function inspectUrl({ force = false } = {}) {
  const githubUrl = normalizeGithubUrl(urlInput.value);
  if (!githubUrl) {
    if (force) {
      setStatus("Enter a supported GitHub URL.");
    }
    return false;
  }

  if (!force && currentMetadata && githubUrl === lastInspectedUrl) {
    return true;
  }

  window.clearTimeout(inspectTimer);
  const inspectId = activeInspectId + 1;
  activeInspectId = inspectId;
  setStatus("Fetching GitHub metadata...");
  resultEl.hidden = true;
  createButton.disabled = true;

  try {
    const response = await fetch(`/api/inspect?url=${encodeURIComponent(githubUrl)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not inspect URL.");
    }
    if (inspectId !== activeInspectId) {
      return false;
    }

    currentMetadata = data.metadata;
    lastInspectedUrl = githubUrl;
    applyMetadata(githubUrl, currentMetadata);
    renderPreview();
    createButton.disabled = false;
    setStatus("Preview ready.");
    return true;
  } catch (error) {
    if (inspectId !== activeInspectId) {
      return false;
    }
    currentMetadata = null;
    lastInspectedUrl = "";
    renderPreview();
    setStatus(error.message);
    return false;
  }
}

function applyMetadata(githubUrl, metadata) {
  isApplyingMetadata = true;
  urlInput.value = githubUrl;
  if (!hasEditedTitle) {
    titleInput.value = fieldValue(titleInput, metadata.title);
  }
  if (!hasEditedDescription) {
    descriptionInput.value = fieldValue(descriptionInput, metadata.description);
  }
  isApplyingMetadata = false;
}

function fieldValue(field, value) {
  const maxLength = field.maxLength;
  if (maxLength > 0 && value.length > maxLength) {
    return `${value.slice(0, maxLength - 3).trimEnd()}...`;
  }
  return value;
}

async function createShareLink() {
  setStatus("Creating share link...");
  createButton.disabled = true;

  try {
    const imageDataUrl = renderCanvas();
    const response = await fetch("/api/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        githubUrl: urlInput.value,
        title: titleInput.value,
        description: descriptionInput.value,
        theme: selectedTheme(),
        infoChips: Array.from(selectedInfoChips()),
        imageDataUrl,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not create link.");
    }

    shareUrlInput.value = data.shareUrl;
    resultEl.hidden = false;
    setStatus("Share link created.");
  } catch (error) {
    setStatus(error.message);
  } finally {
    createButton.disabled = !currentMetadata;
  }
}

function renderPreview() {
  const themeName = selectedTheme();
  const theme = themes[themeName] || themes.paper;
  const state = previewState();

  previewCard.className = `preview-card theme-${themeName}`;
  previewCard.setAttribute(
    "aria-label",
    `${state.fullName}: ${state.title}. ${state.description}`,
  );
  drawPreviewImage(
    previewContext,
    state,
    theme,
    themeName,
    selectedInfoChips(),
  );
}

function selectedTheme() {
  return themeInputs.find((input) => input.checked)?.value || "paper";
}

function selectedInfoChips() {
  return new Set(infoInputs.filter((input) => input.checked).map((input) => input.value));
}

function normalizeGithubUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if ((host !== "github.com" && host !== "www.github.com") || parts.length < 2) {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

function previewState() {
  const metadata = currentMetadata || fallbackMetadata;
  const title = currentMetadata
    ? titleInput.value || metadata.title
    : fallbackMetadata.title;
  const description = currentMetadata
    ? descriptionInput.value || metadata.description
    : fallbackMetadata.description;
  return buildPreviewState(metadata, {
    description,
    hasMetadata: Boolean(currentMetadata),
    title,
  });
}

function renderCanvas() {
  renderPreview();
  return previewCard.toDataURL("image/png");
}

function openPreviewMatrix() {
  if (!hasRenderedMatrix) {
    renderPreviewMatrix(matrix);
    hasRenderedMatrix = true;
  }

  matrixReturnFocus = document.activeElement;
  matrixModal.hidden = false;
  document.body.classList.add("matrix-modal-open");
  closeMatrixButton.focus();
}

function closePreviewMatrix() {
  if (matrixModal.hidden) {
    return;
  }

  matrixModal.hidden = true;
  document.body.classList.remove("matrix-modal-open");

  if (matrixReturnFocus && document.contains(matrixReturnFocus)) {
    matrixReturnFocus.focus();
  }
}

function setStatus(message) {
  statusEl.textContent = message;
}
