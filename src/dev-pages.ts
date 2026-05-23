import type { LinkRecord } from "./types.js";

export function devShareRecord(): LinkRecord {
  return {
    version: 1,
    type: "repo",
    owner: "DiogoNeves",
    repo: "mygh",
    fullName: "DiogoNeves/mygh",
    githubUrl: "https://github.com/DiogoNeves/mygh",
    title: "DiogoNeves/mygh",
    description:
      "Development preview of the saved mygh share page, rendered without creating a stored link.",
    language: "TypeScript",
    stars: 128,
    forks: 12,
    openIssues: 3,
    slug: "dev-share-preview",
    createdAt: "2026-05-23T00:00:00.000Z",
    sharePath: "/dev/share-preview",
    theme: "paper",
  };
}

export function renderDevPreviewMatrixHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>mygh preview image matrix</title>
    <style>
      :root {
        --page: #e8edf0;
        --surface: #fbfdfb;
        --ink: #141616;
        --muted: #626b68;
        --line: #cbd5d0;
        --accent: #116a50;
        --accent-2: #dfff55;
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
        font-family: var(--font-body);
        margin: 0;
        min-height: 100vh;
      }
      main {
        padding: 28px;
      }
      .matrix-shell {
        background: rgba(251, 253, 251, 0.88);
        border: 1px solid rgba(158, 170, 165, 0.7);
        border-radius: 8px;
        box-shadow: 0 28px 80px rgba(20, 22, 22, 0.16);
        overflow: auto;
        padding: 22px;
      }
      .matrix-header-bar {
        align-items: baseline;
        border-bottom: 1px solid var(--line);
        display: flex;
        gap: 12px;
        margin-bottom: 18px;
        padding-bottom: 16px;
      }
      h1 {
        font-family: var(--font-display);
        font-size: 28px;
        line-height: 1;
        margin: 0;
      }
      .matrix-header-bar p {
        color: var(--muted);
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 750;
        margin: 0;
      }
      .matrix-grid {
        display: grid;
        gap: 16px;
        min-width: 1320px;
      }
      .matrix-row {
        align-items: start;
        display: grid;
        gap: 16px;
        grid-template-columns: 170px repeat(3, minmax(320px, 1fr));
      }
      .matrix-header {
        align-items: center;
        color: var(--muted);
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 850;
        text-transform: uppercase;
      }
      .row-label {
        border-top: 1px solid var(--line);
        min-height: 100%;
        padding-top: 12px;
      }
      .row-label span {
        display: block;
        font-family: var(--font-display);
        font-size: 22px;
        font-weight: 700;
        line-height: 1.05;
      }
      .row-label code {
        color: var(--muted);
        display: block;
        font-family: var(--font-mono);
        font-size: 11px;
        line-height: 1.35;
        margin-top: 10px;
        overflow-wrap: anywhere;
      }
      .matrix-cell {
        margin: 0;
      }
      .matrix-cell canvas {
        aspect-ratio: 1200 / 630;
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: 8px 8px 0 rgba(20, 22, 22, 0.12);
        display: block;
        height: auto;
        width: 100%;
      }
      .matrix-cell figcaption {
        color: var(--muted);
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 750;
        margin-top: 8px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="matrix-shell" aria-labelledby="matrix-title">
        <header class="matrix-header-bar">
          <h1 id="matrix-title">mygh preview image matrix</h1>
          <p>local development only</p>
        </header>
        <div class="matrix-grid" id="preview-matrix" data-dev-preview-matrix></div>
      </section>
    </main>
    <script type="module" src="/dev/preview-matrix.js"></script>
  </body>
</html>`;
}

export function renderDevSharePreviewSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-label="mygh development social preview">
  <rect width="1200" height="630" fill="#fbfdfb"/>
  <path d="M0 0h1200v630H0z" fill="none" stroke="#cbd5d0"/>
  <path d="M0 0h400l-98 630H0z" fill="#dfff55" opacity="0.28"/>
  <g stroke="#d7dfda" stroke-width="1">
    <path d="M0 48h1200M0 96h1200M0 144h1200M0 192h1200M0 240h1200M0 288h1200M0 336h1200M0 384h1200M0 432h1200M0 480h1200M0 528h1200M0 576h1200"/>
    <path d="M48 0v630M96 0v630M144 0v630M192 0v630M240 0v630M288 0v630M336 0v630M384 0v630M432 0v630M480 0v630M528 0v630M576 0v630M624 0v630M672 0v630M720 0v630M768 0v630M816 0v630M864 0v630M912 0v630M960 0v630M1008 0v630M1056 0v630M1104 0v630M1152 0v630"/>
  </g>
  <rect x="70" y="70" width="1060" height="490" rx="16" fill="#ffffff" stroke="#cbd5d0"/>
  <rect x="100" y="105" width="48" height="48" rx="12" fill="#141616"/>
  <text x="124" y="136" fill="#ffffff" font-family="monospace" font-size="16" font-weight="800" text-anchor="middle">GH</text>
  <text x="168" y="136" fill="#141616" font-family="monospace" font-size="30" font-weight="800">DiogoNeves/mygh</text>
  <text x="1070" y="136" fill="#116a50" font-family="Georgia, serif" font-size="30" font-weight="700" text-anchor="end">mygh</text>
  <text x="100" y="260" fill="#141616" font-family="Georgia, serif" font-size="70" font-weight="700">Saved share page</text>
  <text x="100" y="342" fill="#141616" font-family="Georgia, serif" font-size="70" font-weight="700">development preview</text>
  <text x="100" y="420" fill="#626b68" font-family="Avenir Next, Segoe UI, sans-serif" font-size="28">Rendered locally without creating a stored link.</text>
  <rect x="100" y="468" width="160" height="48" rx="8" fill="#f2f6f3" stroke="#cbd5d0"/>
  <text x="180" y="499" fill="#626b68" font-family="monospace" font-size="20" font-weight="800" text-anchor="middle">Repository</text>
  <rect x="278" y="468" width="118" height="48" rx="8" fill="#f2f6f3" stroke="#cbd5d0"/>
  <text x="337" y="499" fill="#626b68" font-family="monospace" font-size="20" font-weight="800" text-anchor="middle">128 stars</text>
</svg>`;
}
