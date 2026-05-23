const form = document.querySelector("#inspect-form");
const urlInput = document.querySelector("#github-url");
const titleInput = document.querySelector("#card-title");
const descriptionInput = document.querySelector("#card-description");
const themeInputs = Array.from(document.querySelectorAll('input[name="theme"]'));
const createButton = document.querySelector("#create-link");
const statusEl = document.querySelector("#status");
const resultEl = document.querySelector("#result");
const shareUrlInput = document.querySelector("#share-url");
const copyButton = document.querySelector("#copy-link");
const previewLink = document.querySelector("#preview-link");

const previewCard = document.querySelector("#preview-card");
const previewKind = document.querySelector("#preview-kind");
const previewLanguage = document.querySelector("#preview-language");
const previewRepo = document.querySelector("#preview-repo");
const previewTitle = document.querySelector("#preview-title");
const previewDescription = document.querySelector("#preview-description");
const previewStars = document.querySelector("#preview-stars");
const previewExtra = document.querySelector("#preview-extra");

let currentMetadata = null;

const themes = {
  paper: {
    background: "#f7f8fb",
    panel: "#ffffff",
    border: "#e3e7ef",
    ink: "#0b1220",
    muted: "#687083",
    accent: "#2458ff",
    chip: "#f2f5fb",
    mark: "#0b1220",
  },
  mint: {
    background: "#edf8f1",
    panel: "#fbfffd",
    border: "#c8e6d4",
    ink: "#10251a",
    muted: "#536b5d",
    accent: "#19a66c",
    chip: "#e1f5e9",
    mark: "#103b28",
  },
  dusk: {
    background: "#0a1019",
    panel: "#101722",
    border: "#263449",
    ink: "#ffffff",
    muted: "#aab7c8",
    accent: "#74a2ff",
    chip: "#1a2433",
    mark: "#030711",
  },
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await inspectUrl();
});

for (const input of [titleInput, descriptionInput, ...themeInputs]) {
  input.addEventListener("input", renderPreview);
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

async function inspectUrl() {
  setStatus("Fetching GitHub metadata...");
  resultEl.hidden = true;
  createButton.disabled = true;

  try {
    const response = await fetch(`/api/inspect?url=${encodeURIComponent(urlInput.value)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not inspect URL.");
    }

    currentMetadata = data.metadata;
    titleInput.value = currentMetadata.title;
    descriptionInput.value = currentMetadata.description;
    renderPreview();
    createButton.disabled = false;
    setStatus("Preview ready.");
  } catch (error) {
    currentMetadata = null;
    setStatus(error.message);
  }
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
  const theme = selectedTheme();
  previewCard.className = `preview-card theme-${theme}`;

  if (!currentMetadata) {
    return;
  }

  previewKind.textContent =
    currentMetadata.type === "release" ? "Release" : "Repository";
  previewLanguage.textContent = currentMetadata.language || "Source";
  previewRepo.textContent = currentMetadata.fullName;
  previewTitle.textContent = titleInput.value || currentMetadata.title;
  previewDescription.textContent =
    descriptionInput.value || currentMetadata.description;
  previewStars.textContent = `${formatNumber(currentMetadata.stars)} stars`;
  previewExtra.textContent =
    currentMetadata.type === "release"
      ? currentMetadata.releaseTag || "Release"
      : `${formatNumber(currentMetadata.forks)} forks`;
}

function selectedTheme() {
  return themeInputs.find((input) => input.checked)?.value || "paper";
}

function renderCanvas() {
  const metadata = currentMetadata;
  const theme = themes[selectedTheme()] || themes.paper;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalAlpha = selectedTheme() === "dusk" ? 0.24 : 0.16;
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(1020, 96, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = theme.panel;
  roundRect(ctx, 56, 50, 1088, 530, 28);
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = theme.mark;
  roundRect(ctx, 96, 91, 52, 52, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 17px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("GH", 109, 124);

  ctx.fillStyle = theme.ink;
  ctx.font = "800 31px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(metadata.fullName, 166, 124);

  ctx.fillStyle = theme.accent;
  ctx.font = "850 25px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("mygh", 1048, 124);

  ctx.fillStyle = theme.ink;
  ctx.font = "850 62px ui-sans-serif, system-ui, sans-serif";
  wrapText(ctx, titleInput.value || metadata.title, 96, 250, 690, 70, 2);

  ctx.fillStyle = theme.muted;
  ctx.font = "400 30px ui-sans-serif, system-ui, sans-serif";
  wrapText(
    ctx,
    descriptionInput.value || metadata.description,
    96,
    402,
    720,
    42,
    2,
  );

  const logoLetter = (metadata.repo || metadata.owner || "G").slice(0, 1).toUpperCase();
  ctx.fillStyle = selectedTheme() === "dusk" ? "#060a11" : "#f0f3f8";
  roundRect(ctx, 868, 230, 190, 190, 24);
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.stroke();
  ctx.fillStyle = theme.ink;
  ctx.font = "400 124px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(logoLetter, 963, 368);
  ctx.textAlign = "start";

  const extra =
    metadata.type === "release"
      ? metadata.releaseTag || "Release"
      : `${formatNumber(metadata.forks)} forks`;
  drawChip(ctx, metadata.language || "Source", 96, 510, theme);
  drawChip(ctx, `${formatNumber(metadata.stars)} stars`, 290, 510, theme);
  drawChip(ctx, extra, 468, 510, theme);

  return canvas.toDataURL("image/png");
}

function drawChip(ctx, text, x, y, theme) {
  ctx.font = "800 23px ui-sans-serif, system-ui, sans-serif";
  const clipped = text.length > 24 ? `${text.slice(0, 21)}...` : text;
  const width = Math.min(ctx.measureText(clipped).width + 34, 320);
  ctx.fillStyle = theme.chip;
  roundRect(ctx, x, y, width, 46, 12);
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.stroke();
  ctx.fillStyle = theme.muted;
  ctx.fillText(clipped, x + 17, y + 30);
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
