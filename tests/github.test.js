import assert from "node:assert/strict";
import test from "node:test";
import {
  commitPayload,
  filePayload,
  installGithubMock,
  issuePayload,
  pullPayload,
  releasePayload,
  repoPayload,
} from "./support.js";

const { fetchGithubMetadata, parseGithubUrl } = await import("../.test-dist/src/github.js");

test("parses supported GitHub target URLs", () => {
  assert.deepEqual(parseGithubUrl("https://github.com/octocat/Hello-World"), {
    type: "repo",
    owner: "octocat",
    repo: "Hello-World",
    requestedUrl: "https://github.com/octocat/Hello-World",
  });

  assert.deepEqual(
    parseGithubUrl("https://github.com/octocat/Hello-World/releases/tag/v1.2.3"),
    {
      type: "release",
      owner: "octocat",
      repo: "Hello-World",
      tag: "v1.2.3",
      requestedUrl: "https://github.com/octocat/Hello-World/releases/tag/v1.2.3",
    },
  );

  assert.deepEqual(
    parseGithubUrl("https://github.com/octocat/Hello-World/blob/main/src/index.ts#L12-L18"),
    {
      type: "file",
      owner: "octocat",
      repo: "Hello-World",
      ref: "main",
      path: "src/index.ts",
      lineRange: "L12-L18",
      requestedUrl: "https://github.com/octocat/Hello-World/blob/main/src/index.ts#L12-L18",
    },
  );

  assert.equal(
    parseGithubUrl("https://github.com/octocat/Hello-World/commit/6dcb09b").type,
    "commit",
  );
  assert.equal(parseGithubUrl("https://github.com/octocat/Hello-World/pull/42").number, 42);
  assert.equal(parseGithubUrl("https://github.com/octocat/Hello-World/issues/7").number, 7);
});

test("rejects unsupported GitHub target URLs", () => {
  const badUrls = [
    ["https://example.com/octocat/Hello-World", "Only github.com URLs are supported."],
    ["ssh://github.com/octocat/Hello-World", "Enter an http or https GitHub URL."],
    ["https://github.com", "Enter a supported GitHub URL."],
    [
      "https://github.com/octocat/Hello-World/pull/nope",
      "Enter a valid GitHub pull request number.",
    ],
  ];

  for (const [url, message] of badUrls) {
    assert.throws(() => parseGithubUrl(url), { message });
  }
});

test("fetches latest release metadata with cleaned text and GitHub auth headers", async (t) => {
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

  const target = parseGithubUrl("https://github.com/octocat/Hello-World/releases/latest");
  const metadata = await fetchGithubMetadata(target, { GITHUB_TOKEN: "secret-token" });

  assert.equal(metadata.githubUrl, releasePayload.html_url);
  assert.equal(metadata.title, "Launch");
  assert.equal(metadata.description, "Ships code and release notes.");
  assert.equal(metadata.assetsCount, 2);

  const repoHeaders = new Headers(calls[0].init.headers);
  assert.equal(repoHeaders.get("authorization"), "Bearer secret-token");
  assert.equal(repoHeaders.get("accept"), "application/vnd.github+json");
  assert.equal(repoHeaders.get("user-agent"), "mygh");
});

test("fetches file metadata with path, ref, and line details", async (t) => {
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

  const target = parseGithubUrl(
    "https://github.com/octocat/Hello-World/blob/main/src/index.ts#L12-L18",
  );
  const metadata = await fetchGithubMetadata(target, {});

  assert.equal(metadata.type, "file");
  assert.equal(metadata.githubUrl, "https://github.com/octocat/Hello-World/blob/main/src/index.ts#L12-L18");
  assert.equal(metadata.title, "src/index.ts");
  assert.equal(metadata.language, "TypeScript");
  assert.equal(metadata.fileSize, 2345);
});

test("fetches commit metadata with diff summary", async (t) => {
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

  const target = parseGithubUrl(
    "https://github.com/octocat/Hello-World/commit/6dcb09b5b57875f334f61aebed695e2e4193db5e",
  );
  const metadata = await fetchGithubMetadata(target, {});

  assert.equal(metadata.title, "Fix all the bugs");
  assert.equal(metadata.commitAuthor, "octocat");
  assert.equal(metadata.changedFiles, 2);
  assert.equal(metadata.additions, 104);
  assert.equal(metadata.deletions, 4);
});

test("fetches pull request metadata with state and review details", async (t) => {
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

  const target = parseGithubUrl("https://github.com/octocat/Hello-World/pull/42");
  const metadata = await fetchGithubMetadata(target, {});

  assert.equal(metadata.title, "#42 Add better cards");
  assert.equal(metadata.description, "Adds support for pull requests.");
  assert.equal(metadata.state, "open");
  assert.equal(metadata.author, "octocat");
  assert.equal(metadata.comments, 5);
  assert.equal(metadata.changedFiles, 4);
});

test("fetches issue metadata with labels and comments", async (t) => {
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

  const target = parseGithubUrl("https://github.com/octocat/Hello-World/issues/7");
  const metadata = await fetchGithubMetadata(target, {});

  assert.equal(metadata.title, "#7 Make cards clearer");
  assert.equal(metadata.state, "closed");
  assert.deepEqual(metadata.labels, ["design", "good first issue", "frontend"]);
  assert.equal(metadata.comments, 5);
});
