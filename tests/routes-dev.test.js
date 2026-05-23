import assert from "node:assert/strict";
import test from "node:test";

const { default: worker } = await import("../.test-dist/src/index.js");

test("renders dev share preview locally without KV or saved image", async () => {
  const response = await worker.fetch(
    new Request("http://localhost:8787/dev/share-preview"),
    {},
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(html, /DiogoNeves\/mygh/);
  assert.match(html, /Development preview of the saved mygh share page/);
  assert.match(html, /<meta property="og:image" content="http:\/\/localhost:8787\/dev\/share-preview\.svg">/);
  assert.match(html, /<meta property="og:image:type" content="image\/svg\+xml">/);
  assert.match(html, /<img src="\/dev\/share-preview\.svg" alt="DiogoNeves\/mygh">/);
  assert.match(html, /<input id="share-url" value="http:\/\/localhost:8787\/dev\/share-preview" data-share-path="\/dev\/share-preview" readonly>/);

  const imageResponse = await worker.fetch(
    new Request("http://localhost:8787/dev/share-preview.svg"),
    {},
  );
  const svg = await imageResponse.text();

  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  assert.equal(imageResponse.headers.get("cache-control"), "no-store");
  assert.match(svg, /Saved share page/);

  const routedLocalResponse = await worker.fetch(
    new Request("http://mygh.site/dev/share-preview", {
      headers: { "cf-connecting-ip": "::1" },
    }),
    {},
  );

  assert.equal(routedLocalResponse.status, 200);
});

test("blocks dev share preview on non-local hosts", async () => {
  const response = await worker.fetch(
    new Request("https://mygh.test/dev/share-preview"),
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, "Not found.");
});

test("renders dev preview matrix locally", async () => {
  const response = await worker.fetch(
    new Request("http://localhost:8787/dev/preview-matrix"),
    {},
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-security-policy"), /script-src 'self'/);
  assert.match(html, /mygh preview image matrix/);
  assert.match(html, /data-dev-preview-matrix/);
  assert.match(html, /<script type="module" src="\/dev\/preview-matrix\.js"><\/script>/);
});

test("blocks dev preview matrix on non-local hosts", async () => {
  for (const pathname of ["/dev/preview-matrix", "/dev/preview-matrix.js"]) {
    const response = await worker.fetch(
      new Request(`https://mygh.test${pathname}`),
      {},
    );
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error, "Not found.");
  }
});
