import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  installGithubMock,
  installUnexpectedGithubFetch,
  jsonRequest,
  MemoryKv,
  repoPayload,
} from "./support.js";

const { default: worker } = await import("../.test-dist/src/index.js");

test("rejects non-GitHub inspect URLs before fetching external data", async (t) => {
  installUnexpectedGithubFetch(t);

  const badUrls = [
    "https://example.com/octocat/Hello-World",
    "https://github.com.evil.test/octocat/Hello-World",
    "https://evil.test/github.com/octocat/Hello-World",
    "https://github.com@evil.test/octocat/Hello-World",
    "https://raw.githubusercontent.com/octocat/Hello-World/main/README.md",
  ];

  for (const badUrl of badUrls) {
    const response = await worker.fetch(
      new Request(`https://mygh.test/api/inspect?url=${encodeURIComponent(badUrl)}`),
      {},
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, "Only github.com URLs are supported.");
  }
});

test("reports missing GitHub repositories as not found", async (t) => {
  installGithubMock(t, [
    {
      url: "https://api.github.com/repos/octocat/missing-repo",
      status: 404,
      body: { message: "Not Found" },
    },
  ]);

  const response = await worker.fetch(
    new Request("https://mygh.test/api/inspect?url=https%3A%2F%2Fgithub.com%2Foctocat%2Fmissing-repo"),
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, "GitHub target not found.");
});

test("rejects non-GitHub create URLs before requiring KV or fetching", async (t) => {
  installUnexpectedGithubFetch(t);

  const response = await worker.fetch(
    jsonRequest("https://mygh.test/api/links", {
      githubUrl: "https://example.com/octocat/Hello-World",
    }),
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "Only github.com URLs are supported.");
});

test("creates share links by storing sanitized metadata and PNG bytes in KV", async (t) => {
  installGithubMock(t, [
    {
      url: "https://api.github.com/repos/octocat/Hello-World",
      body: repoPayload(),
    },
  ]);
  const kv = new MemoryKv();
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
  assert.equal(storedRecord.licenseSpdxId, "MIT");
  assert.deepEqual([...storedImage], [...pngBytes]);
  assert.deepEqual(kv.metadata.get(`link:${slug}`), {
    githubUrl: "https://github.com/octocat/Hello-World",
    type: "repo",
  });
});

test("does not write KV data when GitHub returns not found during link creation", async (t) => {
  installGithubMock(t, [
    {
      url: "https://api.github.com/repos/octocat/missing-repo",
      status: 404,
      body: { message: "Not Found" },
    },
  ]);
  const kv = new MemoryKv();

  const response = await worker.fetch(
    jsonRequest("https://mygh.test/api/links", {
      githubUrl: "https://github.com/octocat/missing-repo",
    }),
    { MYGH_LINKS: kv },
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, "GitHub target not found.");
  assert.equal(kv.values.size, 0);
});

test("rejects malformed PNG data before fetching GitHub or writing KV data", async (t) => {
  installUnexpectedGithubFetch(t);
  const kv = new MemoryKv();

  const response = await worker.fetch(
    jsonRequest("https://mygh.test/api/links", {
      githubUrl: "https://github.com/octocat/Hello-World",
      imageDataUrl: "data:image/png;base64,AAAA",
    }),
    { MYGH_LINKS: kv },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "imageDataUrl must contain PNG bytes.");
  assert.equal(kv.values.size, 0);
});
