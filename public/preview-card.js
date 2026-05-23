export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 630;

export const fallbackMetadata = Object.freeze({
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

export const themes = {
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

export function allInfoChips() {
  return new Set(["language", "stars", "extra"]);
}

export function buildPreviewState(metadata = fallbackMetadata, options = {}) {
  const hasMetadata = options.hasMetadata ?? Boolean(metadata);
  const source = metadata || fallbackMetadata;
  const type = source.type || "repo";
  const title = hasMetadata
    ? options.title || source.title
    : fallbackMetadata.title;
  const description = hasMetadata
    ? options.description || source.description
    : fallbackMetadata.description;
  const typeLabel = hasMetadata ? typeLabelFor(type) : "GitHub";

  return {
    ...source,
    type,
    typeLabel,
    title,
    description,
    badge: badgeFor(type),
    extra: extraLabelFor(type, source, hasMetadata),
    language: firstChipFor(type, source, hasMetadata),
    metricLabel: metricLabelFor(type, source, hasMetadata),
  };
}

export function drawPreviewImage(ctx, state, theme, themeName, chips) {
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
  fillOpticallyCenteredText(ctx, state.badge, 124, 119);
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
  const titleY = 238;
  const titleLineHeight = 70;
  const descriptionLineHeight = 38;
  const titleLineCount = measureWrappedLineCount(ctx, state.title, 900, 2);
  const descriptionY = titleY + titleLineCount * titleLineHeight + 5;
  const descriptionMaxLines = Math.max(
    2,
    Math.min(5, Math.floor((465 - descriptionY) / descriptionLineHeight) + 1),
  );
  wrapText(ctx, state.title, 96, titleY, 900, titleLineHeight, 2);

  ctx.fillStyle = theme.muted;
  ctx.font = "400 29px Avenir Next, Trebuchet MS, sans-serif";
  wrapText(
    ctx,
    state.description,
    96,
    descriptionY,
    900,
    descriptionLineHeight,
    descriptionMaxLines,
  );

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

function fillOpticallyCenteredText(ctx, text, x, y) {
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || 0;
  const descent = metrics.actualBoundingBoxDescent || 0;
  if (!ascent && !descent) {
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    return;
  }

  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y + (ascent - descent) / 2);
}

function clipText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  return ellipsizeText(ctx, text, maxWidth);
}

function ellipsizeText(ctx, text, maxWidth) {
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = wordsForText(text);
  if (!words.length || maxLines < 1) {
    return 0;
  }

  const lines = [];
  let line = "";
  let overflow = false;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      if (lines.length >= maxLines) {
        overflow = true;
        break;
      }
      line = word;
    } else {
      line = testLine;
    }
  }

  if (!overflow && line && lines.length < maxLines) {
    lines.push(line);
  } else if (overflow && !lines.length && line) {
    lines.push(line);
  }

  for (let index = 0; index < lines.length; index += 1) {
    const isLastLine = index === lines.length - 1;
    const visibleLine = isLastLine && overflow
      ? ellipsizeText(ctx, lines[index], maxWidth)
      : clipText(ctx, lines[index], maxWidth);
    ctx.fillText(visibleLine, x, y + index * lineHeight);
  }

  return lines.length;
}

function measureWrappedLineCount(ctx, text, maxWidth, maxLines) {
  const words = wordsForText(text);
  if (!words.length || maxLines < 1) {
    return 0;
  }

  let lines = 0;
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines += 1;
      if (lines >= maxLines) {
        return maxLines;
      }
      line = word;
    } else {
      line = testLine;
    }
  }

  return Math.min(maxLines, lines + (line ? 1 : 0));
}

function wordsForText(text) {
  return text.trim().split(/\s+/).filter(Boolean);
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
