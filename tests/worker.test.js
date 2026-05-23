import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

const { default: worker } = await import("../.test-dist/src/index.js");
const originalFetch = globalThis.fetch;

class MemoryKv {
  values = new Map();
  metadata = new Map();

  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) {
      return null;
    }
    if (type === "json") {
      return JSON.parse(value);
    }
    if (type === "arrayBuffer") {
      if (value instanceof ArrayBuffer) {
        return value;
      }
      if (ArrayBuffer.isView(value)) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      }
      return new TextEncoder().encode(String(value)).buffer;
    }
    return value;
  }

  async put(key, value, options = {}) {
    this.values.set(key, value);
    this.metadata.set(key, options.metadata);
  }
}

function installGithubMock(t, responses) {
  const calls = [];
  const pending = [...responses];

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    const response = pending.shift();
    assert.ok(response, `Unexpected GitHub request to ${url}`);
    assert.equal(url, response.url);

    return new Response(JSON.stringify(response.body), {
      status: response.status || 200,
      headers: { "content-type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    assert.equal(pending.length, 0, "Expected all mocked GitHub responses to be used.");
  });

  return calls;
}

function jsonRequest(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function repoPayload(overrides = {}) {
  return {
    owner: {
      login: "octocat",
      avatar_url: "https://avatars.githubusercontent.com/u/583231",
    },
    name: "Hello-World",
    full_name: "octocat/Hello-World",
    html_url: "https://github.com/octocat/Hello-World",
    description: "A **sample** [repository](https://example.com).",
    language: "TypeScript",
    stargazers_count: 12345,
    forks_count: 67,
    open_issues_count: 8,
    ...overrides,
  };
}

const releasePayload = {
  tag_name: "v1.2.3",
  name: "Launch",
  body: "Ships `code` and [release notes](https://example.com).",
  html_url: "https://github.com/octocat/Hello-World/releases/tag/v1.2.3",
  published_at: "2026-05-22T12:00:00Z",
  created_at: "2026-05-22T10:00:00Z",
  assets: [{ name: "app.zip" }, { name: "checksums.txt" }],
};

function linkRecord(overrides = {}) {
  return {
    version: 1,
    type: "repo",
    owner: "octocat",
    repo: "Hello-World",
    fullName: "octocat/Hello-World",
    githubUrl: "https://github.com/octocat/Hello-World",
    title: "octocat/Hello-World",
    description: "A sample repository.",
    language: "TypeScript",
    stars: 12345,
    forks: 67,
    openIssues: 8,
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/583231",
    slug: "share123",
    createdAt: "2026-05-23T00:00:00.000Z",
    sharePath: "/s/share123",
    theme: "paper",
    ...overrides,
  };
}

test("rejects non-GitHub inspect URLs before fetching external data", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    throw new Error("GitHub should not be fetched for invalid input.");
  };

  const response = await worker.fetch(
    new Request("https://mygh.test/api/inspect?url=https%3A%2F%2Fexample.com%2Foctocat%2FHello-World"),
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "Only github.com URLs are supported.");
});

test("inspects latest release URLs with cleaned metadata and GitHub auth headers", async (t) => {
  const calls = installGithubMock(t, [
    {
      url: "https://api.github.com/repos/octocat/Hello-World",
      body: repoPayload(),
    },
    {
      url: "https://api.github.com/repos/octocat/Hello-World/releases/latest",
      body: releasePayload,
    },
  ]);

  const response = await worker.fetch(
    new Request("https://mygh.test/api/inspect?url=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World%2Freleases%2Flatest"),
    { GITHUB_TOKEN: "secret-token" },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.target.type, "release");
  assert.equal(body.metadata.githubUrl, releasePayload.html_url);
  assert.equal(body.metadata.title, "octocat/Hello-World Launch");
  assert.equal(body.metadata.description, "Ships code and release notes.");
  assert.equal(body.metadata.assetsCount, 2);

  const repoHeaders = new Headers(calls[0].init.headers);
  assert.equal(repoHeaders.get("authorization"), "Bearer secret-token");
  assert.equal(repoHeaders.get("accept"), "application/vnd.github+json");
  assert.equal(repoHeaders.get("user-agent"), "mygh");
});

test("creates share links by storing sanitized metadata and PNG bytes in KV", async (t) => {
  installGithubMock(t, [
    {
      url: "https://api.github.com/repos/octocat/Hello-World",
      body: repoPayload(),
    },
  ]);
  const kv = new MemoryKv();
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  const response = await worker.fetch(
    jsonRequest("https://mygh.test/api/links", {
      githubUrl: "https://github.com/octocat/Hello-World",
      title: "  Custom **title**  ",
      description: "Read the [docs](https://example.com) before shipping.",
      theme: "unknown-theme",
      imageDataUrl: `data:image/png;base64,${pngBytes.toString("base64")}`,
    }),
    { MYGH_LINKS: kv },
  );
  const body = await response.json();
  const slug = body.record.slug;
  const storedRecord = await kv.get(`link:${slug}`, "json");
  const storedImage = new Uint8Array(await kv.get(`image:${slug}`, "arrayBuffer"));

  assert.equal(response.status, 201);
  assert.match(slug, /^[0-9A-Za-z]{8}$/);
  assert.equal(body.shareUrl, `https://mygh.test/s/${slug}`);
  assert.equal(body.previewUrl, `https://mygh.test/s/${slug}?preview=1`);
  assert.equal(body.imageUrl, `https://mygh.test/img/${slug}.png`);
  assert.equal(storedRecord.title, "Custom title");
  assert.equal(storedRecord.description, "Read the docs before shipping.");
  assert.equal(storedRecord.theme, "paper");
  assert.deepEqual([...storedImage], [...pngBytes]);
  assert.deepEqual(kv.metadata.get(`link:${slug}`), {
    githubUrl: "https://github.com/octocat/Hello-World",
    type: "repo",
  });
});

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

  const crawlerResponse = await worker.fetch(
    new Request("https://mygh.test/s/share123", {
      headers: { "user-agent": "Twitterbot/1.0" },
    }),
    { MYGH_LINKS: kv },
  );
  const html = await crawlerResponse.text();

  assert.equal(crawlerResponse.status, 200);
  assert.equal(crawlerResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(html, /Owned &quot;Repo&quot; &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /A&amp;B &#039;desc&#039; &lt;tag&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/mygh\.test\/img\/share123\.png">/);
});

test("renders dev share preview locally without KV or saved image", async () => {
  const response = await worker.fetch(
    new Request("http://localhost:8787/dev/share-preview"),
    {},
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(html, /DiogoNeves\/mygh/);
  assert.match(html, /Development preview of the saved mygh share page/);
  assert.match(html, /<meta property="og:image" content="\/dev\/share-preview\.svg">/);

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
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.deepEqual([...body], [...bytes]);
});
