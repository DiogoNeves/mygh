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
