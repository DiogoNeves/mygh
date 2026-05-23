import { githubTypeLabel } from "./github.js";
import { escapeHtml } from "./text.js";
import type { LinkRecord } from "./types.js";

export function renderShareHtml(
  record: LinkRecord,
  baseUrl: string,
  imageUrl?: string,
  nonce?: string,
): string {
  const defaultImagePath = `/img/${record.slug}.png`;
  const previewImageSrc = imageUrl ?? defaultImagePath;
  const resolvedImageUrl = new URL(previewImageSrc, baseUrl).href;
  const imageType = previewImageSrc.endsWith(".svg") ? "image/svg+xml" : "image/png";
  const shareUrl = `${baseUrl}${record.sharePath}`;
  const typeLabel = githubTypeLabel(record.type);
  const escapedTitle = escapeHtml(record.title);
  const escapedDescription = escapeHtml(record.description);
  const escapedShareUrl = escapeHtml(shareUrl);
  const escapedSharePath = escapeHtml(record.sharePath);
  const escapedImageUrl = escapeHtml(resolvedImageUrl);
  const escapedPreviewImageSrc = escapeHtml(previewImageSrc);
  const escapedImageAlt = escapeHtml(
    `${record.title} ${typeLabel} social preview by mygh.`,
  );
  const nonceAttribute = nonce ? ` nonce="${escapeHtml(nonce)}"` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}">
    <link rel="canonical" href="${escapeHtml(record.githubUrl)}">

    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(shareUrl)}">
    <meta property="og:title" content="${escapedTitle}">
    <meta property="og:description" content="${escapedDescription}">
    <meta property="og:image" content="${escapedImageUrl}">
    <meta property="og:image:url" content="${escapedImageUrl}">
    <meta property="og:image:secure_url" content="${escapedImageUrl}">
    <meta property="og:image:type" content="${escapeHtml(imageType)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${escapedImageAlt}">
    <meta property="og:site_name" content="mygh">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapedTitle}">
    <meta name="twitter:description" content="${escapedDescription}">
    <meta name="twitter:image" content="${escapedImageUrl}">
    <meta name="twitter:image:alt" content="${escapedImageAlt}">

    <style${nonceAttribute}>
      :root {
        --page: #e8edf0;
        --surface: #fbfdfb;
        --surface-2: #f2f6f3;
        --ink: #141616;
        --muted: #626b68;
        --line: #cbd5d0;
        --line-strong: #9eaaa5;
        --press: #0d1010;
        --accent: #116a50;
        --accent-2: #dfff55;
        --green: #2f9b73;
        --shadow: 0 28px 80px rgba(20, 22, 22, 0.16);
        --soft-shadow: 0 16px 42px rgba(20, 22, 22, 0.10);
        --font-body: "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif;
        --font-display: Georgia, "Times New Roman", serif;
        --font-mono: "SFMono-Regular", "Cascadia Mono", "Liberation Mono", monospace;
      }
      * {
        box-sizing: border-box;
        letter-spacing: 0;
      }
      body {
        background:
          linear-gradient(120deg, rgba(251, 253, 251, 0.96) 0 31%, rgba(223, 255, 85, 0.24) 31% 36%, transparent 36%),
          repeating-linear-gradient(0deg, rgba(20, 22, 22, 0.08) 0 1px, transparent 1px 56px),
          repeating-linear-gradient(90deg, rgba(20, 22, 22, 0.06) 0 1px, transparent 1px 56px),
          var(--page);
        color: var(--ink);
        display: grid;
        font-family: var(--font-body);
        line-height: 1.45;
        margin: 0;
        min-height: 100vh;
        padding: 28px;
      }
      body::before {
        background:
          linear-gradient(90deg, rgba(20, 22, 22, 0.08), transparent 18%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.44), transparent 34%);
        content: "";
        inset: 0;
        pointer-events: none;
        position: fixed;
      }
      main {
        background: rgba(251, 253, 251, 0.88);
        border: 1px solid rgba(158, 170, 165, 0.7);
        border-radius: 8px;
        box-shadow: var(--shadow);
        margin: auto;
        max-width: 760px;
        overflow: hidden;
        padding: 22px;
        position: relative;
        width: min(100%, 760px);
      }
      main::before {
        background:
          linear-gradient(90deg, rgba(20, 22, 22, 0.07) 1px, transparent 1px),
          linear-gradient(0deg, rgba(20, 22, 22, 0.05) 1px, transparent 1px);
        background-size: 28px 28px;
        content: "";
        inset: 0;
        opacity: 0.55;
        pointer-events: none;
        position: absolute;
      }
      main > * {
        position: relative;
      }
      .brand {
        align-items: center;
        border-bottom: 1px solid var(--line);
        display: flex;
        gap: 12px;
        margin-bottom: 22px;
        min-height: 58px;
        padding-bottom: 16px;
      }
      .brand-mark {
        align-items: center;
        background: linear-gradient(135deg, var(--press) 0 62%, var(--accent) 62% 100%);
        border: 1px solid var(--press);
        border-radius: 8px;
        box-shadow: 6px 6px 0 var(--accent-2);
        color: #ffffff;
        display: inline-flex;
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 900;
        height: 38px;
        justify-content: center;
        width: 38px;
      }
      .brand-name {
        font-family: var(--font-display);
        font-size: 24px;
        font-weight: 700;
      }
      .brand-name span {
        color: var(--accent);
      }
      .ready {
        align-items: center;
        background: rgba(251, 253, 251, 0.82);
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: var(--soft-shadow);
        display: grid;
        gap: 14px;
        grid-template-columns: auto minmax(0, 1fr);
        margin-bottom: 18px;
        padding: 18px;
      }
      .check {
        align-items: center;
        background: rgba(47, 155, 115, 0.15);
        border-radius: 999px;
        color: var(--green);
        display: inline-flex;
        font-size: 22px;
        height: 40px;
        justify-content: center;
        width: 40px;
      }
      h1 {
        font-family: var(--font-display);
        font-size: clamp(26px, 4vw, 38px);
        line-height: 1.04;
        margin: 0 0 8px;
      }
      p {
        color: var(--muted);
        font-size: 15px;
        margin: 0;
      }
      label,
      .preview-label {
        color: var(--ink);
        display: block;
        font-size: 14px;
        font-weight: 850;
        margin: 0 0 8px;
      }
      .share-panel {
        background: rgba(251, 253, 251, 0.82);
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: var(--soft-shadow);
        display: grid;
        gap: 10px;
        margin-bottom: 18px;
        padding: 18px;
      }
      .share-row {
        align-items: center;
        background: #ffffff;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        display: grid;
        gap: 12px;
        grid-template-columns: minmax(0, 1fr) auto;
        min-height: 60px;
        padding: 9px 9px 9px 12px;
      }
      .share-row input {
        background: transparent;
        border: 0;
        color: var(--accent);
        font: 800 13px var(--font-mono);
        min-width: 0;
        outline: 0;
        width: 100%;
      }
      .share-row button {
        background: var(--press);
        border: 1px solid var(--press);
        border-radius: 8px;
        color: #ffffff;
        font: 850 13px var(--font-body);
        min-height: 42px;
        padding: 0 16px;
      }
      .share-row button:hover {
        background: #252828;
      }
      .copy-status {
        color: var(--muted);
        font-family: var(--font-mono);
        font-size: 12px;
        min-height: 17px;
      }
      .preview-block {
        margin-bottom: 24px;
      }
      img {
        aspect-ratio: 1200 / 630;
        background: var(--surface);
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        box-shadow: 18px 18px 0 rgba(20, 22, 22, 0.08), var(--soft-shadow);
        display: block;
        height: auto;
        margin: 0;
        max-width: 100%;
        width: 100%;
      }
      .actions {
        background: #ffffff;
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
      }
      a {
        align-items: center;
        color: var(--ink);
        display: flex;
        font-size: 15px;
        font-weight: 850;
        justify-content: space-between;
        min-height: 56px;
        padding: 0 16px;
        text-decoration: none;
      }
      a:hover {
        background: var(--surface-2);
      }
      .footer {
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-family: var(--font-mono);
        font-size: 12px;
        margin-top: 26px;
        padding-top: 16px;
        text-align: center;
      }
      .footer strong {
        color: var(--accent);
      }
      @media (max-width: 520px) {
        body {
          padding: 0;
        }
        main {
          border: 0;
          border-radius: 0;
          box-shadow: none;
          min-height: 100vh;
          padding: 16px;
        }
        .ready {
          padding: 14px;
        }
        .share-panel {
          padding: 14px;
        }
        .share-row {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <span class="brand-mark">my</span>
        <span class="brand-name">my<span>gh</span></span>
      </div>
      <div class="ready">
        <span class="check">&#10003;</span>
        <div>
          <h1>Your link is ready!</h1>
          <p>${escapeHtml(typeLabel)} preview by mygh.</p>
        </div>
      </div>
      <div class="share-panel">
        <label for="share-url">Share link</label>
        <div class="share-row">
          <input id="share-url" value="${escapedShareUrl}" data-share-path="${escapedSharePath}" readonly>
          <button id="copy-share-link" type="button">Copy</button>
        </div>
        <p class="copy-status" id="copy-status" role="status"></p>
      </div>
      <div class="preview-block">
        <p class="preview-label">Social media preview</p>
        <img src="${escapedPreviewImageSrc}" alt="${escapedTitle}">
      </div>
      <div class="actions">
        <a href="${escapeHtml(record.githubUrl)}">
          <span>Open on GitHub</span>
          <span>&#8599;</span>
        </a>
      </div>
      <div class="footer">Served by <strong>mygh</strong></div>
    </main>
    <script${nonceAttribute}>
      (() => {
        const input = document.querySelector("#share-url");
        const button = document.querySelector("#copy-share-link");
        const status = document.querySelector("#copy-status");
        if (!input || !button) return;

        const sharePath = input.dataset.sharePath;
        if (sharePath) {
          input.value = new URL(sharePath, window.location.href).href;
        }

        const showCopied = () => {
          button.textContent = "Copied";
          if (status) status.textContent = "Copied.";
          window.setTimeout(() => {
            button.textContent = "Copy";
            if (status) status.textContent = "";
          }, 1600);
        };

        button.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(input.value);
            showCopied();
          } catch {
            input.focus();
            input.select();
            if (document.execCommand && document.execCommand("copy")) {
              showCopied();
            } else if (status) {
              status.textContent = "Copy the selected link.";
            }
          }
        });
      })();
    </script>
  </body>
</html>`;
}
