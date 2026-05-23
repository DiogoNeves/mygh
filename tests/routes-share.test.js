import assert from "node:assert/strict";
import test from "node:test";
import { linkRecord, MemoryKv } from "./support.js";

const { default: worker } = await import("../.test-dist/src/index.js");

test("redirects human share visits but renders escaped Open Graph HTML for crawlers", async () => {
  const kv = new MemoryKv();
  kv.values.set(
    "link:share123",
    JSON.stringify(
      linkRecord({
        title: 'Owned "Repo" <script>alert(1)</script>',
        description: "A&B 'desc' <tag>",
      }),
    ),
  );

  const humanResponse = await worker.fetch(
    new Request("https://mygh.test/s/share123", {
      headers: { "user-agent": "Mozilla/5.0" },
    }),
    { MYGH_LINKS: kv },
  );
  assert.equal(humanResponse.status, 302);
  assert.equal(humanResponse.headers.get("location"), "https://github.com/octocat/Hello-World");

  const trailingSlashHumanResponse = await worker.fetch(
    new Request("https://mygh.test/s/share123/", {
      headers: { "user-agent": "Mozilla/5.0" },
    }),
    { MYGH_LINKS: kv },
  );
  assert.equal(trailingSlashHumanResponse.status, 302);
  assert.equal(
    trailingSlashHumanResponse.headers.get("location"),
    "https://github.com/octocat/Hello-World",
  );

  const crawlerResponse = await worker.fetch(
    new Request("https://mygh.test/s/share123", {
      headers: { "user-agent": "Twitterbot/1.0" },
    }),
    { MYGH_LINKS: kv },
  );
  const html = await crawlerResponse.text();

  assert.equal(crawlerResponse.status, 200);
  assert.equal(crawlerResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(crawlerResponse.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(crawlerResponse.headers.get("content-security-policy"), /script-src 'nonce-[a-f0-9]+'/);
  assert.match(crawlerResponse.headers.get("content-security-policy"), /style-src 'nonce-[a-f0-9]+'/);
  assert.equal(crawlerResponse.headers.get("x-content-type-options"), "nosniff");
  assert.match(html, /Owned &quot;Repo&quot; &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /A&amp;B &#039;desc&#039; &lt;tag&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/mygh\.test\/img\/share123\.png">/);
  assert.match(html, /<meta property="og:image:url" content="https:\/\/mygh\.test\/img\/share123\.png">/);
  assert.match(html, /<meta property="og:image:secure_url" content="https:\/\/mygh\.test\/img\/share123\.png">/);
  assert.match(html, /<meta property="og:image:type" content="image\/png">/);
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
  assert.match(
    html,
    /<meta property="og:image:alt" content="Owned &quot;Repo&quot; &lt;script&gt;alert\(1\)&lt;\/script&gt; GitHub repository social preview by mygh\.">/,
  );
  assert.match(
    html,
    /<meta name="twitter:image:alt" content="Owned &quot;Repo&quot; &lt;script&gt;alert\(1\)&lt;\/script&gt; GitHub repository social preview by mygh\.">/,
  );
  assert.match(html, /<label for="share-url">Share link<\/label>/);
  assert.match(html, /<input id="share-url" value="https:\/\/mygh\.test\/s\/share123" data-share-path="\/s\/share123" readonly>/);
  assert.match(html, /id="copy-share-link"/);
  assert.match(html, /Social media preview/);
});

test("supports HEAD checks for share pages and generated images", async () => {
  const kv = new MemoryKv();
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  kv.values.set("link:share123", JSON.stringify(linkRecord()));
  kv.values.set("image:share123", bytes.buffer);

  const humanResponse = await worker.fetch(
    new Request("https://mygh.test/s/share123", {
      method: "HEAD",
      headers: { "user-agent": "Mozilla/5.0" },
    }),
    { MYGH_LINKS: kv },
  );
  assert.equal(humanResponse.status, 302);
  assert.equal(humanResponse.headers.get("location"), "https://github.com/octocat/Hello-World");
  assert.equal(await humanResponse.text(), "");

  const crawlerResponse = await worker.fetch(
    new Request("https://mygh.test/s/share123", {
      method: "HEAD",
      headers: { "user-agent": "Twitterbot/1.0" },
    }),
    { MYGH_LINKS: kv },
  );
  assert.equal(crawlerResponse.status, 200);
  assert.equal(crawlerResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(crawlerResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await crawlerResponse.text(), "");

  const imageResponse = await worker.fetch(
    new Request("https://mygh.test/img/share123.png", {
      method: "HEAD",
    }),
    { MYGH_LINKS: kv },
  );
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/png");
  assert.equal(imageResponse.headers.get("content-length"), String(bytes.byteLength));
  assert.equal(imageResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(imageResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await imageResponse.text(), "");
});

test("uses the local host header for generated preview URLs during local development", async () => {
  const kv = new MemoryKv();
  kv.values.set("link:share123", JSON.stringify(linkRecord()));

  const response = await worker.fetch(
    new Request("http://mygh.site/s/share123", {
      headers: {
        host: "localhost:8787",
        "user-agent": "Twitterbot/1.0",
      },
    }),
    { MYGH_LINKS: kv },
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<meta property="og:url" content="http:\/\/localhost:8787\/s\/share123">/);
  assert.match(html, /<meta property="og:image" content="http:\/\/localhost:8787\/img\/share123\.png">/);
  assert.match(html, /<input id="share-url" value="http:\/\/localhost:8787\/s\/share123" data-share-path="\/s\/share123" readonly>/);
  assert.match(html, /<img src="\/img\/share123\.png" alt="octocat\/Hello-World">/);
});

test("refuses stored share redirects to unsafe targets", async () => {
  const unsafeTargets = [
    "https://example.com/phishing",
    "http://github.com/octocat/Hello-World",
    "javascript:alert(1)",
    "https://github.com",
  ];

  for (const githubUrl of unsafeTargets) {
    const kv = new MemoryKv();
    kv.values.set(
      "link:badtarget",
      JSON.stringify(
        linkRecord({
          slug: "badtarget",
          sharePath: "/s/badtarget",
          githubUrl,
        }),
      ),
    );

    const response = await worker.fetch(
      new Request("https://mygh.test/s/badtarget", {
        headers: { "user-agent": "Mozilla/5.0" },
      }),
      { MYGH_LINKS: kv },
    );
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(response.headers.get("location"), null);
    assert.equal(body.error, "Stored share link target is invalid.");
  }
});

test("serves stored PNG images with long-lived cache headers", async () => {
  const kv = new MemoryKv();
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  kv.values.set("image:share123", bytes.buffer);

  const response = await worker.fetch(
    new Request("https://mygh.test/img/share123.png"),
    { MYGH_LINKS: kv },
  );
  const body = new Uint8Array(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("content-length"), String(bytes.byteLength));
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual([...body], [...bytes]);
});
