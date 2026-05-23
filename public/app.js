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
const previewKind = document.querySelector("#preview-kind");
const previewLanguage = document.querySelector("#preview-language");
const previewRepo = document.querySelector("#preview-repo");
const previewTitle = document.querySelector("#preview-title");
const previewDescription = document.querySelector("#preview-description");
const previewStars = document.querySelector("#preview-stars");
const previewExtra = document.querySelector("#preview-extra");
const previewAvatar = document.querySelector("#preview-avatar");
const previewMonogram = document.querySelector("#preview-monogram");

let currentMetadata = null;

const themes = {
  paper: {
    background: "#fbfdfb",
    panel: "#ffffff",
    border: "#cbd5d0",
    ink: "#141616",
    muted: "#626b68",
    accent: "#f05a3f",
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
    accent: "#f05a3f",
    secondary: "#17a7b6",
    chip: "#20302e",
    mark: "#060909",
  },
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await inspectUrl();
});

const statElements = {
  language: previewLanguage,
  stars: previewStars,
  extra: previewExtra,
};

for (const input of [titleInput, descriptionInput, ...themeInputs, ...infoInputs]) {
  input.addEventListener("input", renderPreview);
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
  const theme = selectedTheme();
  previewCard.className = `preview-card theme-${theme}`;
  updateVisibleStats();

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

  const monogram = (currentMetadata.repo || currentMetadata.owner || "G")
    .slice(0, 1)
    .toUpperCase();
  previewMonogram.textContent = monogram;
  if (currentMetadata.ownerAvatarUrl) {
    previewAvatar.src = currentMetadata.ownerAvatarUrl;
    previewAvatar.hidden = false;
    previewMonogram.hidden = true;
  } else {
    previewAvatar.removeAttribute("src");
    previewAvatar.hidden = true;
    previewMonogram.hidden = false;
  }
}

function selectedTheme() {
  return themeInputs.find((input) => input.checked)?.value || "paper";
}

function selectedInfoChips() {
  return new Set(infoInputs.filter((input) => input.checked).map((input) => input.value));
}

function updateVisibleStats() {
  const selected = selectedInfoChips();
  for (const [key, element] of Object.entries(statElements)) {
    element.hidden = !selected.has(key);
  }
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
  drawGrid(ctx, theme, canvas.width, canvas.height);

  ctx.save();
  ctx.globalAlpha = selectedTheme() === "dusk" ? 0.34 : 0.28;
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(400, 0);
  ctx.lineTo(265, canvas.height);
  ctx.lineTo(0, canvas.height);
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
  ctx.font = "900 17px Avenir Next, Trebuchet MS, sans-serif";
  ctx.fillText("GH", 111, 126);

  ctx.fillStyle = theme.ink;
  ctx.font = "800 30px SFMono-Regular, Cascadia Mono, monospace";
  ctx.fillText(clipText(ctx, metadata.fullName, 620), 174, 127);

  ctx.fillStyle = theme.accent;
  ctx.font = "700 32px Georgia, Times New Roman, serif";
  ctx.fillText("mygh", 1042, 128);

  ctx.fillStyle = theme.ink;
  ctx.font = "700 68px Georgia, Times New Roman, serif";
  wrapText(ctx, titleInput.value || metadata.title, 96, 258, 690, 75, 2);

  ctx.fillStyle = theme.muted;
  ctx.font = "400 29px Avenir Next, Trebuchet MS, sans-serif";
  wrapText(
    ctx,
    descriptionInput.value || metadata.description,
    96,
    416,
    720,
    42,
    2,
  );

  const logoLetter = (metadata.repo || metadata.owner || "G").slice(0, 1).toUpperCase();
  ctx.fillStyle = selectedTheme() === "dusk" ? "#060909" : "#f2f6f3";
  roundRect(ctx, 868, 226, 202, 202, 16);
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.stroke();
  ctx.fillStyle = theme.ink;
  ctx.font = "700 126px Georgia, Times New Roman, serif";
  ctx.textAlign = "center";
  ctx.fillText(logoLetter, 969, 370);
  ctx.textAlign = "start";

  const extra =
    metadata.type === "release"
      ? metadata.releaseTag || "Release"
      : `${formatNumber(metadata.forks)} forks`;
  const chips = selectedInfoChips();
  let chipX = 96;
  if (chips.has("language")) {
    chipX += drawChip(ctx, metadata.language || "Source", chipX, 510, theme) + 14;
  }
  if (chips.has("stars")) {
    chipX += drawChip(ctx, `${formatNumber(metadata.stars)} stars`, chipX, 510, theme) + 14;
  }
  if (chips.has("extra")) {
    drawChip(ctx, extra, chipX, 510, theme);
  }

  return canvas.toDataURL("image/png");
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

function drawGrid(ctx, theme, width, height) {
  ctx.save();
  ctx.globalAlpha = selectedTheme() === "dusk" ? 0.18 : 0.13;
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
