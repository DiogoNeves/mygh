import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("homepage advertises the dedicated social preview image", async () => {
  const html = await readFile("public/index.html", "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/mygh\.site\/">/);
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/mygh\.site\/mygh-social-preview\.png">/);
  assert.match(html, /<meta property="og:image:type" content="image\/png">/);
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/mygh\.site\/mygh-social-preview\.png">/);
});

test("homepage favicon uses the centered my badge", async () => {
  const favicon = await readFile("public/favicon.svg", "utf8");

  assert.match(favicon, /viewBox="0 0 64 64"/);
  assert.match(favicon, /<rect x="14" y="16" width="44" height="44" rx="11" fill="#d6ff38"\/>/);
  assert.match(favicon, /<rect x="8" y="8" width="44" height="44" rx="11" fill="#0b0f0e"\/>/);
  assert.match(favicon, /x="30"/);
  assert.match(favicon, /y="30"/);
  assert.match(favicon, /text-anchor="middle"/);
  assert.match(favicon, /dominant-baseline="central"/);
  assert.match(favicon, />my<\/text>/);
});

test("homepage social preview image is a 1200 by 630 PNG", async () => {
  const image = await readFile("public/mygh-social-preview.png");

  assert.deepEqual([...image.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

test("homepage footer links to author, source, and X without periods", async () => {
  const html = await readFile("public/index.html", "utf8");
  const footer = html.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/)?.[1] || "";

  assert.match(footer, /https:\/\/github\.com\/DiogoNeves/);
  assert.match(footer, /https:\/\/github\.com\/DiogoNeves\/mygh/);
  assert.match(footer, /https:\/\/x\.com\/DiogoSnows/);
  assert.match(footer, /Ask me anything on/);
  assert.doesNotMatch(footer, /<\/a>\./);
  assert.doesNotMatch(footer, /<\/span>\./);
});

test("homepage exposes the preview matrix modal", async () => {
  const [html, appScript, styles] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/app.js", "utf8"),
    readFile("public/styles.css", "utf8"),
  ]);

  assert.match(html, /id="open-preview-matrix"/);
  assert.match(html, /class="see-all-button"/);
  assert.match(html, /id="preview-matrix-modal"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /data-preview-matrix/);
  assert.match(appScript, /from "\.\/preview-matrix\.js"/);
  assert.match(appScript, /renderPreviewMatrix\(matrix\)/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.matrix-modal-panel \{[\s\S]*?min-height: 100vh;/);
  assert.match(styles, /\.matrix-header \{[\s\S]*?display: none !important;/);
  assert.match(styles, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(styles, /\.matrix-grid > \.matrix-header \{[\s\S]*?display: none !important;/);
  assert.match(styles, /\.matrix-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
});

test("homepage dismisses stuck chip tooltips after toggle clicks", async () => {
  const [appScript, styles] = await Promise.all([
    readFile("public/app.js", "utf8"),
    readFile("public/styles.css", "utf8"),
  ]);

  assert.match(appScript, /const chipControlLabels = Array\.from/);
  assert.match(appScript, /function dismissChipTooltips\(\)/);
  assert.match(appScript, /chip-tooltips-dismissed/);
  assert.match(appScript, /document\.activeElement instanceof HTMLElement/);
  assert.match(appScript, /pointerenter/);
  assert.match(styles, /\.chip-tooltips-dismissed \.chip-controls label:hover \.chip-tooltip/);
  assert.match(styles, /\.chip-tooltips-dismissed \.chip-controls label:focus-within \.chip-tooltip/);
  assert.match(styles, /visibility: hidden;/);
});

test("preview matrix data covers every supported link type", async () => {
  const { matrixSamples } = await import("../public/preview-matrix.js");

  assert.deepEqual(
    matrixSamples.map((sample) => sample.type),
    ["repo", "release", "file", "commit", "pull", "issue"],
  );
});
