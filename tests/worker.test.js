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

function installUnexpectedGithubFetch(t) {
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    throw new Error(`GitHub should not be fetched for invalid input: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });
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
    license: {
      name: "MIT License",
      spdx_id: "MIT",
    },
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

const filePayload = {
  type: "file",
  name: "index.ts",
  path: "src/index.ts",
  sha: "abc123def456",
  size: 2345,
  html_url: "https://github.com/octocat/Hello-World/blob/main/src/index.ts",
};

const commitPayload = {
  sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e",
  html_url:
    "https://github.com/octocat/Hello-World/commit/6dcb09b5b57875f334f61aebed695e2e4193db5e",
  commit: {
    message: "Fix all the bugs\n\nAdds the missing tests.",
    author: {
      name: "Monalisa Octocat",
      date: "2026-05-22T12:00:00Z",
    },
  },
  author: {
    login: "octocat",
  },
  stats: {
    additions: 104,
    deletions: 4,
  },
  files: [{ filename: "src/index.ts" }, { filename: "tests/worker.test.js" }],
};

const pullPayload = {
  number: 42,
  title: "Add better cards",
  body: "<!-- template note -->\nAdds support for **pull requests**.",
  html_url: "https://github.com/octocat/Hello-World/pull/42",
  state: "open",
  draft: false,
  merged_at: null,
  user: {
    login: "octocat",
  },
  comments: 3,
  review_comments: 2,
  additions: 30,
  deletions: 8,
  changed_files: 4,
};

const issuePayload = {
  number: 7,
  title: "Make cards clearer",
  body: "The card should explain the linked item.",
  html_url: "https://github.com/octocat/Hello-World/issues/7",
  state: "closed",
  user: {
    login: "monalisa",
  },
  comments: 5,
  labels: [
    { name: "design" },
    { name: "good first issue" },
    { name: "frontend" },
    { name: "later" },
  ],
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
    licenseName: "MIT License",
    licenseSpdxId: "MIT",
    slug: "share123",
    createdAt: "2026-05-23T00:00:00.000Z",
    sharePath: "/s/share123",
    theme: "paper",
    ...overrides,
  };
}

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

test("rejects non-http GitHub inspect URLs before fetching external data", async (t) => {
  installUnexpectedGithubFetch(t);

  const response = await worker.fetch(
    new Request("https://mygh.test/api/inspect?url=ssh%3A%2F%2Fgithub.com%2Foctocat%2FHello-World"),
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "Enter an http or https GitHub URL.");
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
  assert.equal(body.metadata.title, "Launch");
  assert.equal(body.metadata.description, "Ships code and release notes.");
  assert.equal(body.metadata.assetsCount, 2);

  const repoHeaders = new Headers(calls[0].init.headers);
  assert.equal(repoHeaders.get("authorization"), "Bearer secret-token");
  assert.equal(repoHeaders.get("accept"), "application/vnd.github+json");
  assert.equal(repoHeaders.get("user-agent"), "mygh");
});

test("inspects GitHub file URLs with path, ref, and line metadata", async (t) => {
  installGithubMock(t, [
    {
      url: "https://api.github.com/repos/octocat/Hello-World",
      body: repoPayload(),
    },
    {
      url: "https://api.github.com/repos/octocat/Hello-World/contents/src/index.ts?ref=main",
      body: filePayload,
    },
  ]);

  const response = await worker.fetch(
    new Request("https://mygh.test/api/inspect?url=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World%2Fblob%2Fmain%2Fsrc%2Findex.ts%23L12-L18"),
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.target.type, "file");
  assert.equal(body.target.ref, "main");
  assert.equal(body.target.path, "src/index.ts");
  assert.equal(body.target.lineRange, "L12-L18");
  assert.equal(body.metadata.type, "file");
  assert.equal(body.metadata.githubUrl, "https://github.com/octocat/Hello-World/blob/main/src/index.ts#L12-L18");
  assert.equal(body.metadata.title, "src/index.ts");
  assert.equal(body.metadata.language, "TypeScript");
  assert.equal(body.metadata.fileSize, 2345);
});

test("inspects GitHub commit URLs with diff metadata", async (t) => {
  installGithubMock(t, [
    {
      url: "https://api.github.com/repos/octocat/Hello-World",
      body: repoPayload(),
    },
    {
      url: "https://api.github.com/repos/octocat/Hello-World/commits/6dcb09b5b57875f334f61aebed695e2e4193db5e",
      body: commitPayload,
    },
  ]);

  const response = await worker.fetch(
    new Request("https://mygh.test/api/inspect?url=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World%2Fcommit%2F6dcb09b5b57875f334f61aebed695e2e4193db5e"),
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.target.type, "commit");
  assert.equal(body.metadata.title, "Fix all the bugs");
  assert.equal(body.metadata.commitAuthor, "octocat");
  assert.equal(body.metadata.changedFiles, 2);
  assert.equal(body.metadata.additions, 104);
  assert.equal(body.metadata.deletions, 4);
});

test("inspects GitHub pull request URLs with state and review metadata", async (t) => {
  installGithubMock(t, [
    {
      url: "https://api.github.com/repos/octocat/Hello-World",
      body: repoPayload(),
    },
    {
      url: "https://api.github.com/repos/octocat/Hello-World/pulls/42",
      body: pullPayload,
    },
  ]);

  const response = await worker.fetch(
    new Request("https://mygh.test/api/inspect?url=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World%2Fpull%2F42"),
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.target.type, "pull");
  assert.equal(body.target.number, 42);
  assert.equal(body.metadata.title, "#42 Add better cards");
  assert.equal(body.metadata.description, "Adds support for pull requests.");
  assert.equal(body.metadata.state, "open");
  assert.equal(body.metadata.author, "octocat");
  assert.equal(body.metadata.comments, 5);
  assert.equal(body.metadata.changedFiles, 4);
});

test("inspects GitHub issue URLs with labels and comments", async (t) => {
  installGithubMock(t, [
    {
      url: "https://api.github.com/repos/octocat/Hello-World",
      body: repoPayload(),
    },
    {
      url: "https://api.github.com/repos/octocat/Hello-World/issues/7",
      body: issuePayload,
    },
  ]);

  const response = await worker.fetch(
    new Request("https://mygh.test/api/inspect?url=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World%2Fissues%2F7"),
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.target.type, "issue");
  assert.equal(body.target.number, 7);
  assert.equal(body.metadata.title, "#7 Make cards clearer");
  assert.equal(body.metadata.state, "closed");
  assert.deepEqual(body.metadata.labels, ["design", "good first issue", "frontend"]);
  assert.equal(body.metadata.comments, 5);
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
