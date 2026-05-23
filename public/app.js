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
const previewLink = document.querySelector("#preview-link");

const previewCard = document.querySelector("#preview-card");
const previewContext = previewCard.getContext("2d");

let currentMetadata = null;
let activeInspectId = 0;
let hasEditedDescription = false;
let hasEditedTitle = false;
let inspectTimer = 0;
let isApplyingMetadata = false;
let lastInspectedUrl = "";

const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 630;

const fallbackMetadata = Object.freeze({
  type: "repo",
  fullName: "owner/repo",
  owner: "owner",
  repo: "repo",
  title: "Paste a GitHub link worth sharing",
  description: "mygh creates an unfurl-friendly link that redirects back to GitHub.",
  language: "GitHub",
  stars: 0,
  forks: 0,
  openIssues: 0,
});

const themes = {
  paper: {
    background: "#fbfdfb",
    panel: "#ffffff",
    border: "#cbd5d0",
    ink: "#141616",
    muted: "#626b68",
    accent: "#116a50",
    secondary: "#dfff55",
    chip: "#f2f6f3",
    mark: "#0d1010",
  },
  mint: {
    background: "#e6f7ed",
    panel: "#fbfffd",
    border: "#a8cdbb",
    ink: "#10241d",
    muted: "#4e6b5e",
    accent: "#116a50",
    secondary: "#dfff55",
    chip: "#d7f0e3",
    mark: "#10241d",
  },
  dusk: {
    background: "#111817",
    panel: "#151f1d",
    border: "#45615f",
    ink: "#f6faf8",
    muted: "#a8bab5",
    accent: "#dfff55",
    secondary: "#17a7b6",
    chip: "#20302e",
    mark: "#060909",
  },
};

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
    previewLink.href = data.previewUrl;
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
  const type = metadata.type || "repo";
  const title = currentMetadata
    ? titleInput.value || metadata.title
    : fallbackMetadata.title;
  const description = currentMetadata
    ? descriptionInput.value || metadata.description
    : fallbackMetadata.description;
  const typeLabel = currentMetadata ? typeLabelFor(type) : "GitHub";

  return {
    ...metadata,
    type,
    typeLabel,
    title,
    description,
    badge: badgeFor(type),
    extra: extraLabelFor(type, metadata, currentMetadata),
    kindLabel: typeLabel,
    language: firstChipFor(type, metadata, currentMetadata),
    metricLabel: metricLabelFor(type, metadata, currentMetadata),
  };
}

function typeLabelFor(type) {
  return {
    repo: "Repository",
    release: "Release",
    file: "File",
    commit: "Commit",
    pull: "Pull request",
    issue: "Issue",
  }[type] || "GitHub";
}

function badgeFor(type) {
  return {
    repo: "GH",
    release: "v",
    file: "</>",
    commit: "SHA",
    pull: "PR",
    issue: "#",
  }[type] || "GH";
}

function firstChipFor(type, metadata, hasMetadata) {
  if (!hasMetadata) {
    return "GitHub";
  }
  if (type === "file") {
    return metadata.language || "File";
  }
  return typeLabelFor(type);
}

function metricLabelFor(type, metadata, hasMetadata) {
  if (!hasMetadata) {
    return "Ready";
  }
  if (type === "file") {
    return formatBytes(metadata.fileSize);
  }
  if (type === "commit" || type === "pull") {
    return pluralize(metadata.changedFiles, "file");
  }
  if (type === "issue") {
    return pluralize(metadata.comments, "comment");
  }
  return `${formatNumber(metadata.stars)} stars`;
}

function extraLabelFor(type, metadata, hasMetadata) {
  if (!hasMetadata) {
    return "Preview";
  }
  if (type === "release") {
    return metadata.releaseTag || "Release";
  }
  if (type === "file") {
    return metadata.lineRange || shortRef(metadata.ref) || "File";
  }
  if (type === "commit") {
    return diffLabel(metadata.additions, metadata.deletions);
  }
  if (type === "pull" || type === "issue") {
    return stateLabel(metadata.state);
  }
  return licenseLabel(metadata) || "No license";
}

function pluralize(value, noun) {
  const number = Number(value || 0);
  return `${formatNumber(number)} ${noun}${number === 1 ? "" : "s"}`;
}

function formatBytes(value) {
  const number = Number(value || 0);
  if (!number) {
    return "0 bytes";
  }
  if (number < 1024) {
    return `${number} bytes`;
  }
  const units = ["KB", "MB", "GB"];
  let size = number / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}

function shortRef(value) {
  if (!value) {
    return "";
  }
  return value.length > 18 ? `${value.slice(0, 15)}...` : value;
}

function shortSha(value) {
  if (!value) {
    return "";
  }
  return value.slice(0, 7);
}

function licenseLabel(metadata) {
  return metadata.licenseSpdxId || metadata.licenseName || "";
}

function diffLabel(additions, deletions) {
  const plus = Number(additions || 0);
  const minus = Number(deletions || 0);
  if (!plus && !minus) {
    return "No diff";
  }
  return `+${formatNumber(plus)} -${formatNumber(minus)}`;
}

function stateLabel(value) {
  const label = (value || "open").toString();
  return `${label[0].toUpperCase()}${label.slice(1)}`;
}

function renderCanvas() {
  renderPreview();
  return previewCard.toDataURL("image/png");
}

function drawPreviewImage(ctx, state, theme, themeName, chips) {
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  drawGrid(ctx, theme, PREVIEW_WIDTH, PREVIEW_HEIGHT, themeName);

  ctx.save();
  ctx.globalAlpha = themeName === "dusk" ? 0.34 : 0.28;
  ctx.fillStyle = theme.secondary;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(400, 0);
  ctx.lineTo(265, PREVIEW_HEIGHT);
  ctx.lineTo(0, PREVIEW_HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = theme.panel;
  roundRect(ctx, 56, 50, 1088, 530, 16);
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = theme.mark;
  roundRect(ctx, 96, 91, 56, 56, 16);
  ctx.fill();
  ctx.fillStyle = theme.secondary;
  roundRect(ctx, 105, 100, 56, 56, 16);
  ctx.fill();
  ctx.fillStyle = theme.mark;
  roundRect(ctx, 96, 91, 56, 56, 16);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = state.badge.length > 2
    ? "900 14px Avenir Next, Trebuchet MS, sans-serif"
    : "900 18px Avenir Next, Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(state.badge, 124, 119);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = theme.ink;
  ctx.font = "800 30px SFMono-Regular, Cascadia Mono, monospace";
  ctx.fillText(clipText(ctx, state.fullName, 620), 174, 127);

  ctx.save();
  ctx.fillStyle = theme.accent;
  ctx.font = "700 32px Georgia, Times New Roman, serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("mygh", 1104, 92);
  ctx.restore();

  ctx.fillStyle = theme.ink;
  ctx.font = "700 68px Georgia, Times New Roman, serif";
  wrapText(ctx, state.title, 96, 238, 900, 70, 2);

  ctx.fillStyle = theme.muted;
  ctx.font = "400 29px Avenir Next, Trebuchet MS, sans-serif";
  wrapText(ctx, state.description, 96, 383, 900, 38, 2);

  let chipX = 96;
  if (chips.has("language")) {
    chipX += drawChip(ctx, state.language, chipX, 500, theme) + 14;
  }
  if (chips.has("stars")) {
    chipX += drawChip(ctx, state.metricLabel, chipX, 500, theme) + 14;
  }
  if (chips.has("extra")) {
    drawChip(ctx, state.extra, chipX, 500, theme);
  }
}

function drawChip(ctx, text, x, y, theme) {
  ctx.font = "800 23px SFMono-Regular, Cascadia Mono, monospace";
  const clipped = text.length > 24 ? `${text.slice(0, 21)}...` : text;
  const width = Math.min(ctx.measureText(clipped).width + 34, 320);
  ctx.fillStyle = theme.chip;
  roundRect(ctx, x, y, width, 46, 10);
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.stroke();
  ctx.fillStyle = theme.muted;
  ctx.fillText(clipped, x + 17, y + 30);
  return width;
}

function drawGrid(ctx, theme, width, height, themeName) {
  ctx.save();
  ctx.globalAlpha = themeName === "dusk" ? 0.18 : 0.13;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function clipText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines += 1;
      ctx.fillText(lines === maxLines ? `${line}...` : line, x, y);
      if (lines >= maxLines) return;
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line && lines < maxLines) {
    ctx.fillText(line, x, y);
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function formatNumber(value) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value || 0);
}

function setStatus(message) {
  statusEl.textContent = message;
}
