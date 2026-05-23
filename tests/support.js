import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;

export class MemoryKv {
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

export function installGithubMock(t, responses) {
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

export function installUnexpectedGithubFetch(t) {
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    throw new Error(`GitHub should not be fetched for invalid input: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

export function jsonRequest(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function repoPayload(overrides = {}) {
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

export const releasePayload = {
  tag_name: "v1.2.3",
  name: "Launch",
  body: "Ships `code` and [release notes](https://example.com).",
  html_url: "https://github.com/octocat/Hello-World/releases/tag/v1.2.3",
  published_at: "2026-05-22T12:00:00Z",
  created_at: "2026-05-22T10:00:00Z",
  assets: [{ name: "app.zip" }, { name: "checksums.txt" }],
};

export const filePayload = {
  type: "file",
  name: "index.ts",
  path: "src/index.ts",
  sha: "abc123def456",
  size: 2345,
  html_url: "https://github.com/octocat/Hello-World/blob/main/src/index.ts",
};

export const commitPayload = {
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

export const pullPayload = {
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

export const issuePayload = {
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

export function linkRecord(overrides = {}) {
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
