interface Env {
  ASSETS?: Fetcher;
  MYGH_LINKS?: KVNamespace;
  GITHUB_TOKEN?: string;
}

type TargetType = "repo" | "release" | "file" | "commit" | "pull" | "issue";

interface GithubTarget {
  type: TargetType;
  owner: string;
  repo: string;
  tag?: string;
  ref?: string;
  path?: string;
  lineRange?: string;
  sha?: string;
  number?: number;
  requestedUrl: string;
}

interface PreviewMetadata {
  type: TargetType;
  owner: string;
  repo: string;
  fullName: string;
  githubUrl: string;
  title: string;
  description: string;
  language?: string;
  stars: number;
  forks: number;
  openIssues: number;
  ownerAvatarUrl?: string;
  licenseName?: string;
  licenseSpdxId?: string;
  releaseTag?: string;
  releaseName?: string;
  publishedAt?: string;
  assetsCount?: number;
  ref?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  fileSha?: string;
  lineRange?: string;
  commitSha?: string;
  commitAuthor?: string;
  committedAt?: string;
  changedFiles?: number;
  additions?: number;
  deletions?: number;
  number?: number;
  state?: string;
  author?: string;
  comments?: number;
  labels?: string[];
  draft?: boolean;
  mergedAt?: string;
}

interface LinkRecord extends PreviewMetadata {
  version: 1;
  slug: string;
  createdAt: string;
  sharePath: string;
  theme: string;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_GITHUB_URL_LENGTH = 2048;
const MAX_JSON_BODY_CHARS = 3_000_000;
const MAX_PNG_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "mygh" });
      }

      if (request.method === "GET" && url.pathname === "/api/inspect") {
        return await handleInspect(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/links") {
        return await handleCreateLink(request, env);
      }

      if (request.method === "GET" && isDevelopmentOnlyPath(url.pathname)) {
        if (!isLocalDevelopmentRequest(request)) {
          throw new HttpError(404, "Not found.");
        }
        if (url.pathname === "/dev/share-preview") {
          return handleDevSharePreview(request);
        }
        if (url.pathname === "/dev/share-preview.svg") {
          return handleDevSharePreviewImage();
        }
        if (url.pathname === "/dev/preview-matrix") {
          return handleDevPreviewMatrix();
        }
        return await handleDevAsset(request, env);
      }

      const imageMatch = url.pathname.match(/^\/img\/([a-zA-Z0-9_-]+)\.png$/);
      if (request.method === "GET" && imageMatch) {
        return await handleImage(imageMatch[1], env);
      }

      const shareMatch = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)$/);
      if (request.method === "GET" && shareMatch) {
        return await handleShare(request, env, shareMatch[1]);
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response("mygh is running.", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleInspect(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const githubUrl = url.searchParams.get("url");
  if (!githubUrl) {
    throw new HttpError(400, "Missing url query parameter.");
  }

  const target = parseGithubUrl(githubUrl);
  const metadata = await fetchGithubMetadata(target, env);

  return json({ target, metadata });
}

async function handleCreateLink(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const githubUrl = readRequiredString(body.githubUrl, "githubUrl");
  const imageDataUrl = readOptionalString(body.imageDataUrl);
  const theme = normalizeTheme(readOptionalString(body.theme));

  const target = parseGithubUrl(githubUrl);
  const kv = requireKv(env);
  const image = imageDataUrl ? decodePngDataUrl(imageDataUrl) : undefined;
  const metadata = await fetchGithubMetadata(target, env);
  const title = cleanOverride(readOptionalString(body.title), metadata.title, 90);
  const description = cleanOverride(
    readOptionalString(body.description),
    metadata.description,
    220,
  );

  const slug = await createSlug(kv);
  const record: LinkRecord = {
    ...metadata,
    title,
    description,
    version: 1,
    slug,
    createdAt: new Date().toISOString(),
    sharePath: `/s/${slug}`,
    theme,
  };

  if (image) {
    await kv.put(`image:${slug}`, image);
  }

  await kv.put(`link:${slug}`, JSON.stringify(record), {
    metadata: { githubUrl: record.githubUrl, type: record.type },
  });

  const baseUrl = getBaseUrl(request);
  return json(
    {
      record,
      shareUrl: `${baseUrl}/s/${slug}`,
      previewUrl: `${baseUrl}/s/${slug}?preview=1`,
      imageUrl: `${baseUrl}/img/${slug}.png`,
    },
    201,
  );
}

function handleDevSharePreview(request: Request): Response {
  const baseUrl = getBaseUrl(request);
  const nonce = randomNonce();
  return new Response(
    renderShareHtml(
      devShareRecord(),
      baseUrl,
      "/dev/share-preview.svg",
      nonce,
    ),
    {
      headers: shareHtmlHeaders("no-store", nonce),
    },
  );
}

function handleDevSharePreviewImage(): Response {
  return new Response(renderDevSharePreviewSvg(), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function handleDevPreviewMatrix(): Response {
  return new Response(renderDevPreviewMatrixHtml(), {
    headers: devPreviewMatrixHeaders(),
  });
}

async function handleDevAsset(request: Request, env: Env): Promise<Response> {
  if (!env.ASSETS) {
    throw new HttpError(404, "Not found.");
  }

  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function devShareRecord(): LinkRecord {
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

function renderDevPreviewMatrixHtml(): string {
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

function renderDevSharePreviewSvg(): string {
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

async function handleImage(slug: string, env: Env): Promise<Response> {
  const kv = requireKv(env);
  const image = await kv.get(`image:${slug}`, "arrayBuffer");
  if (!image) {
    throw new HttpError(404, "Image not found.");
  }

  return new Response(image, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

async function handleShare(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const kv = requireKv(env);
  const record = validateStoredLinkRecord(
    await kv.get<LinkRecord>(`link:${slug}`, "json"),
    slug,
  );
  if (!record) {
    throw new HttpError(404, "Share link not found.");
  }

  const url = new URL(request.url);
  const forcePreview = url.searchParams.get("preview") === "1";
  if (!forcePreview && !isCrawler(request)) {
    return Response.redirect(record.githubUrl, 302);
  }

  const baseUrl = getBaseUrl(request);
  const nonce = randomNonce();
  return new Response(renderShareHtml(record, baseUrl, undefined, nonce), {
    headers: shareHtmlHeaders("public, max-age=300", nonce),
  });
}

function parseGithubUrl(rawUrl: string): GithubTarget {
  if (rawUrl.length > MAX_GITHUB_URL_LENGTH) {
    throw new HttpError(400, "GitHub URL is too long.");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "Enter a valid GitHub URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new HttpError(400, "Enter an http or https GitHub URL.");
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    throw new HttpError(400, "Only github.com URLs are supported.");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new HttpError(400, "Enter a supported GitHub URL.");
  }

  const owner = decodePathPart(parts[0]);
  const repo = decodePathPart(parts[1]).replace(/\.git$/, "");
  if (!isSafeGithubPathPart(owner) || !isSafeGithubPathPart(repo)) {
    throw new HttpError(400, "Unsupported GitHub owner or repository name.");
  }

  if (parts[2] === "releases" && parts[3] === "tag" && parts[4]) {
    return {
      type: "release",
      owner,
      repo,
      tag: cleanGithubPathValue(
        decodePathPart(parts.slice(4).join("/")),
        "release tag",
      ),
      requestedUrl: rawUrl,
    };
  }

  if (parts[2] === "releases" && parts[3] === "latest") {
    return {
      type: "release",
      owner,
      repo,
      requestedUrl: rawUrl,
    };
  }

  if (parts[2] === "blob" && parts.length >= 5) {
    const fileParts = parts.slice(3).map(decodePathPart);
    const ref = cleanGithubPathValue(fileParts[0], "file ref");
    const path = cleanGithubPathValue(fileParts.slice(1).join("/"), "file path");
    return {
      type: "file",
      owner,
      repo,
      ref,
      path,
      lineRange: parseLineRange(parsed.hash),
      requestedUrl: rawUrl,
    };
  }

  if (parts[2] === "commit" && parts[3]) {
    const sha = cleanGithubPathValue(decodePathPart(parts[3]), "commit SHA");
    return {
      type: "commit",
      owner,
      repo,
      sha,
      requestedUrl: rawUrl,
    };
  }

  if ((parts[2] === "pull" || parts[2] === "pulls") && parts[3]) {
    return {
      type: "pull",
      owner,
      repo,
      number: parseGithubNumber(parts[3], "pull request"),
      requestedUrl: rawUrl,
    };
  }

  if ((parts[2] === "issue" || parts[2] === "issues") && parts[3]) {
    return {
      type: "issue",
      owner,
      repo,
      number: parseGithubNumber(parts[3], "issue"),
      requestedUrl: rawUrl,
    };
  }

  return { type: "repo", owner, repo, requestedUrl: rawUrl };
}

async function fetchGithubMetadata(
  target: GithubTarget,
  env: Env,
): Promise<PreviewMetadata> {
  const repo = await fetchGithubRepo(target, env);

  const base: PreviewMetadata = {
    type: target.type,
    owner: repo.owner.login,
    repo: repo.name,
    fullName: repo.full_name,
    githubUrl: repo.html_url,
    title: repo.name,
    description: truncate(cleanText(repo.description || "A GitHub repository."), 220),
    language: repo.language || undefined,
    stars: Number(repo.stargazers_count || 0),
    forks: Number(repo.forks_count || 0),
    openIssues: Number(repo.open_issues_count || 0),
    ownerAvatarUrl: repo.owner.avatar_url || undefined,
    licenseName: cleanLicenseValue(repo.license?.name),
    licenseSpdxId: cleanLicenseSpdxId(repo.license?.spdx_id),
  };

  if (target.type === "repo") {
    return base;
  }

  if (target.type === "release") {
    return await fetchReleaseMetadata(target, repo, base, env);
  }

  if (target.type === "file") {
    return await fetchFileMetadata(target, repo, base, env);
  }

  if (target.type === "commit") {
    return await fetchCommitMetadata(target, repo, base, env);
  }

  if (target.type === "pull") {
    return await fetchPullMetadata(target, repo, base, env);
  }

  return await fetchIssueMetadata(target, repo, base, env);
}

async function fetchGithubRepo(
  target: Pick<GithubTarget, "owner" | "repo">,
  env: Env,
): Promise<Record<string, any>> {
  return githubFetch(
    `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`,
    env,
  );
}

async function fetchReleaseMetadata(
  target: GithubTarget,
  repo: Record<string, any>,
  base: PreviewMetadata,
  env: Env,
): Promise<PreviewMetadata> {
  const releasePath = target.tag
    ? `releases/tags/${encodeURIComponent(target.tag)}`
    : "releases/latest";
  const release = await githubFetch(
    `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/${releasePath}`,
    env,
  );
  const releaseTitle = release.name || release.tag_name;
  const releaseDescription = truncate(
    cleanText(release.body || repo.description || "A GitHub release."),
    220,
  );

  return {
    ...base,
    githubUrl: release.html_url,
    title: releaseTitle,
    description: releaseDescription,
    releaseTag: release.tag_name,
    releaseName: release.name || undefined,
    publishedAt: release.published_at || release.created_at || undefined,
    assetsCount: Array.isArray(release.assets) ? release.assets.length : 0,
  };
}

async function fetchFileMetadata(
  target: GithubTarget,
  repo: Record<string, any>,
  base: PreviewMetadata,
  env: Env,
): Promise<PreviewMetadata> {
  if (!target.ref || !target.path) {
    throw new HttpError(400, "Enter a GitHub file URL.");
  }

  const file = await fetchGithubFileContent(target, env);
  if (Array.isArray(file) || file.type !== "file") {
    throw new HttpError(400, "Enter a GitHub file URL, not a directory.");
  }

  const filePath = cleanText(String(file.path || target.path));
  const fileName = cleanText(String(file.name || filePath.split("/").pop() || "File"));
  const language = detectLanguage(filePath) || repo.language || "File";
  const size = Number(file.size || 0);
  const lineNote = target.lineRange ? ` at ${target.lineRange}` : "";

  return {
    ...base,
    githubUrl: withLineRange(file.html_url || target.requestedUrl, target.lineRange),
    title: filePath,
    description: truncate(`${fileName}${lineNote} in ${repo.full_name}.`, 220),
    language,
    ref: target.ref,
    filePath,
    fileName,
    fileSize: Number.isFinite(size) ? size : undefined,
    fileSha: file.sha || undefined,
    lineRange: target.lineRange,
  };
}

async function fetchCommitMetadata(
  target: GithubTarget,
  repo: Record<string, any>,
  base: PreviewMetadata,
  env: Env,
): Promise<PreviewMetadata> {
  if (!target.sha) {
    throw new HttpError(400, "Enter a GitHub commit URL.");
  }

  const commit = await githubFetch(
    `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/commits/${encodeURIComponent(target.sha)}`,
    env,
  );
  const rawMessage = String(commit.commit?.message || "GitHub commit.");
  const title = cleanText(firstSentenceOrLine(rawMessage));
  const sha = String(commit.sha || target.sha);
  const author =
    commit.author?.login ||
    commit.commit?.author?.name ||
    commit.commit?.committer?.name ||
    undefined;
  const changedFiles = Array.isArray(commit.files) ? commit.files.length : undefined;

  return {
    ...base,
    githubUrl: commit.html_url || target.requestedUrl,
    title,
    description: truncate(
      `${shortSha(sha)} in ${repo.full_name}${author ? ` by ${author}` : ""}.`,
      220,
    ),
    language: "Commit",
    commitSha: sha,
    commitAuthor: author,
    committedAt: commit.commit?.author?.date || commit.commit?.committer?.date || undefined,
    additions: numberOrUndefined(commit.stats?.additions),
    deletions: numberOrUndefined(commit.stats?.deletions),
    changedFiles,
  };
}

async function fetchPullMetadata(
  target: GithubTarget,
  repo: Record<string, any>,
  base: PreviewMetadata,
  env: Env,
): Promise<PreviewMetadata> {
  const number = requireGithubNumber(target.number, "pull request");
  const pull = await githubFetch(
    `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/pulls/${number}`,
    env,
  );
  const state = pull.merged_at ? "merged" : pull.draft ? "draft" : String(pull.state || "open");
  const title = `#${number} ${cleanText(String(pull.title || "Pull request"))}`;
  const fallbackDescription = `${capitalize(state)} pull request in ${repo.full_name}.`;

  return {
    ...base,
    githubUrl: pull.html_url || target.requestedUrl,
    title: truncate(title, 90),
    description: truncate(cleanBodyOrFallback(pull.body, fallbackDescription), 220),
    language: "Pull request",
    number,
    state,
    author: pull.user?.login || undefined,
    comments: numberOrUndefined((pull.comments || 0) + (pull.review_comments || 0)),
    additions: numberOrUndefined(pull.additions),
    deletions: numberOrUndefined(pull.deletions),
    changedFiles: numberOrUndefined(pull.changed_files),
    draft: Boolean(pull.draft),
    mergedAt: pull.merged_at || undefined,
  };
}

async function fetchIssueMetadata(
  target: GithubTarget,
  repo: Record<string, any>,
  base: PreviewMetadata,
  env: Env,
): Promise<PreviewMetadata> {
  const number = requireGithubNumber(target.number, "issue");
  const issue = await githubFetch(
    `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/issues/${number}`,
    env,
  );
  const state = String(issue.state || "open");
  const title = `#${number} ${cleanText(String(issue.title || "Issue"))}`;
  const labels = Array.isArray(issue.labels)
    ? issue.labels
        .map((label: Record<string, any>) => cleanText(String(label.name || "")))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    ...base,
    githubUrl: issue.html_url || target.requestedUrl,
    title: truncate(title, 90),
    description: truncate(
      cleanText(issue.body || `${capitalize(state)} issue in ${repo.full_name}.`),
      220,
    ),
    language: "Issue",
    number,
    state,
    author: issue.user?.login || undefined,
    comments: numberOrUndefined(issue.comments),
    labels,
  };
}

async function fetchGithubFileContent(
  target: GithubTarget,
  env: Env,
): Promise<Record<string, any> | Record<string, any>[]> {
  const parts = [target.ref || "", ...(target.path || "").split("/")].filter(Boolean);
  let lastNotFound: unknown;

  for (let splitIndex = 1; splitIndex < parts.length; splitIndex += 1) {
    const ref = parts.slice(0, splitIndex).join("/");
    const path = parts.slice(splitIndex).join("/");
    try {
      const file = await githubFetch(
        `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodeGithubPath(path)}?ref=${encodeURIComponent(ref)}`,
        env,
      );
      target.ref = ref;
      target.path = path;
      return file;
    } catch (error) {
      if (!isHttpStatus(error, 404)) {
        throw error;
      }
      lastNotFound = error;
    }
  }

  throw lastNotFound || new HttpError(404, "GitHub file not found.");
}

async function githubFetch(url: string, env: Env): Promise<any> {
  const headers = new Headers({
    accept: "application/vnd.github+json",
    "user-agent": "mygh",
    "x-github-api-version": "2022-11-28",
  });

  if (env.GITHUB_TOKEN) {
    headers.set("authorization", `Bearer ${env.GITHUB_TOKEN}`);
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 404) {
      throw new HttpError(404, "GitHub target not found.");
    }
    if (response.status === 403) {
      throw new HttpError(502, "GitHub rate limit reached. Try again later.");
    }
    throw new HttpError(502, `GitHub returned ${response.status}.`);
  }

  return response.json();
}

function renderShareHtml(
  record: LinkRecord,
  baseUrl: string,
  imageUrl = `${baseUrl}/img/${record.slug}.png`,
  nonce?: string,
): string {
  const shareUrl = `${baseUrl}${record.sharePath}`;
  const typeLabel = githubTypeLabel(record.type);
  const escapedTitle = escapeHtml(record.title);
  const escapedDescription = escapeHtml(record.description);
  const escapedShareUrl = escapeHtml(shareUrl);
  const escapedSharePath = escapeHtml(record.sharePath);
  const nonceAttribute = nonce ? ` nonce="${escapeHtml(nonce)}"` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}">
    <link rel="canonical" href="${escapeHtml(record.githubUrl)}">

    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(shareUrl)}">
    <meta property="og:title" content="${escapedTitle}">
    <meta property="og:description" content="${escapedDescription}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="mygh">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapedTitle}">
    <meta name="twitter:description" content="${escapedDescription}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">

	    <style${nonceAttribute}>
	      :root {
	        --page: #e8edf0;
	        --surface: #fbfdfb;
	        --surface-2: #f2f6f3;
	        --ink: #141616;
	        --muted: #626b68;
	        --line: #cbd5d0;
	        --line-strong: #9eaaa5;
	        --press: #0d1010;
	        --accent: #116a50;
	        --accent-2: #dfff55;
	        --green: #2f9b73;
	        --shadow: 0 28px 80px rgba(20, 22, 22, 0.16);
	        --soft-shadow: 0 16px 42px rgba(20, 22, 22, 0.10);
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
	        display: grid;
	        font-family: var(--font-body);
	        line-height: 1.45;
	        margin: 0;
	        min-height: 100vh;
	        padding: 28px;
	      }
	      body::before {
	        background:
	          linear-gradient(90deg, rgba(20, 22, 22, 0.08), transparent 18%),
	          linear-gradient(180deg, rgba(255, 255, 255, 0.44), transparent 34%);
	        content: "";
	        inset: 0;
	        pointer-events: none;
	        position: fixed;
	      }
	      main {
	        background: rgba(251, 253, 251, 0.88);
	        border: 1px solid rgba(158, 170, 165, 0.7);
	        border-radius: 8px;
	        box-shadow: var(--shadow);
	        margin: auto;
	        max-width: 760px;
	        overflow: hidden;
	        padding: 22px;
	        position: relative;
	        width: min(100%, 760px);
	      }
	      main::before {
	        background:
	          linear-gradient(90deg, rgba(20, 22, 22, 0.07) 1px, transparent 1px),
	          linear-gradient(0deg, rgba(20, 22, 22, 0.05) 1px, transparent 1px);
	        background-size: 28px 28px;
	        content: "";
	        inset: 0;
	        opacity: 0.55;
	        pointer-events: none;
	        position: absolute;
	      }
	      main > * {
	        position: relative;
	      }
	      .brand {
	        align-items: center;
	        border-bottom: 1px solid var(--line);
	        display: flex;
	        gap: 12px;
	        margin-bottom: 22px;
	        min-height: 58px;
	        padding-bottom: 16px;
	      }
	      .brand-mark {
	        align-items: center;
	        background: linear-gradient(135deg, var(--press) 0 62%, var(--accent) 62% 100%);
	        border: 1px solid var(--press);
	        border-radius: 8px;
	        box-shadow: 6px 6px 0 var(--accent-2);
	        color: #ffffff;
	        display: inline-flex;
	        font-family: var(--font-mono);
	        font-size: 12px;
	        font-weight: 900;
	        height: 38px;
	        justify-content: center;
	        width: 38px;
	      }
	      .brand-name {
	        font-family: var(--font-display);
	        font-size: 24px;
	        font-weight: 700;
	      }
	      .brand-name span {
	        color: var(--accent);
	      }
	      .ready {
	        align-items: center;
	        background: rgba(251, 253, 251, 0.82);
	        border: 1px solid var(--line);
	        border-radius: 8px;
	        box-shadow: var(--soft-shadow);
	        display: grid;
	        gap: 14px;
	        grid-template-columns: auto minmax(0, 1fr);
	        margin-bottom: 18px;
	        padding: 18px;
	      }
	      .check {
	        align-items: center;
	        background: rgba(47, 155, 115, 0.15);
	        border-radius: 999px;
	        color: var(--green);
	        display: inline-flex;
	        font-size: 22px;
	        height: 40px;
	        justify-content: center;
	        width: 40px;
	      }
	      h1 {
	        font-family: var(--font-display);
	        font-size: clamp(26px, 4vw, 38px);
	        line-height: 1.04;
	        margin: 0 0 8px;
	      }
	      p {
	        color: var(--muted);
	        font-size: 15px;
	        margin: 0;
	      }
	      label,
	      .preview-label {
	        color: var(--ink);
	        display: block;
	        font-size: 14px;
	        font-weight: 850;
	        margin: 0 0 8px;
	      }
	      .share-panel {
	        background: rgba(251, 253, 251, 0.82);
	        border: 1px solid var(--line);
	        border-radius: 8px;
	        box-shadow: var(--soft-shadow);
	        display: grid;
	        gap: 10px;
	        margin-bottom: 18px;
	        padding: 18px;
	      }
	      .share-row {
	        align-items: center;
	        background: #ffffff;
	        border: 1px solid var(--line-strong);
	        border-radius: 8px;
	        display: grid;
	        gap: 12px;
	        grid-template-columns: minmax(0, 1fr) auto;
	        min-height: 60px;
	        padding: 9px 9px 9px 12px;
	      }
	      .share-row input {
	        background: transparent;
	        border: 0;
	        color: var(--accent);
	        font: 800 13px var(--font-mono);
	        min-width: 0;
	        outline: 0;
	        width: 100%;
	      }
	      .share-row button {
	        background: var(--press);
	        border: 1px solid var(--press);
	        border-radius: 8px;
	        color: #ffffff;
	        font: 850 13px var(--font-body);
	        min-height: 42px;
	        padding: 0 16px;
	      }
	      .share-row button:hover {
	        background: #252828;
	      }
	      .copy-status {
	        color: var(--muted);
	        font-family: var(--font-mono);
	        font-size: 12px;
	        min-height: 17px;
	      }
	      .preview-block {
	        margin-bottom: 24px;
	      }
	      img {
	        aspect-ratio: 1200 / 630;
	        background: var(--surface);
	        border: 1px solid var(--line-strong);
	        border-radius: 8px;
	        box-shadow: 18px 18px 0 rgba(20, 22, 22, 0.08), var(--soft-shadow);
	        display: block;
	        height: auto;
	        margin: 0;
	        max-width: 100%;
	        width: 100%;
	      }
	      .actions {
	        background: #ffffff;
	        border: 1px solid var(--line);
	        border-radius: 8px;
	        overflow: hidden;
	      }
	      a {
	        align-items: center;
	        color: var(--ink);
	        display: flex;
	        font-size: 15px;
	        font-weight: 850;
	        justify-content: space-between;
	        min-height: 56px;
	        padding: 0 16px;
	        text-decoration: none;
	      }
	      a:hover {
	        background: var(--surface-2);
	      }
	      .footer {
	        border-top: 1px solid var(--line);
	        color: var(--muted);
	        font-family: var(--font-mono);
	        font-size: 12px;
	        margin-top: 26px;
	        padding-top: 16px;
	        text-align: center;
	      }
	      .footer strong {
	        color: var(--accent);
	      }
	      @media (max-width: 520px) {
	        body {
	          padding: 0;
	        }
	        main {
	          border: 0;
	          border-radius: 0;
	          box-shadow: none;
	          min-height: 100vh;
	          padding: 16px;
	        }
	        .ready {
	          padding: 14px;
	        }
	        .share-panel {
	          padding: 14px;
	        }
	        .share-row {
	          grid-template-columns: 1fr;
	        }
	      }
	    </style>
	  </head>
	  <body>
	    <main>
	      <div class="brand">
	        <span class="brand-mark">my</span>
	        <span class="brand-name">my<span>gh</span></span>
	      </div>
	      <div class="ready">
	        <span class="check">&#10003;</span>
        <div>
	          <h1>Your link is ready!</h1>
	          <p>${escapeHtml(typeLabel)} preview by mygh.</p>
	        </div>
	      </div>
	      <div class="share-panel">
	        <label for="share-url">Share link</label>
	        <div class="share-row">
	          <input id="share-url" value="${escapedShareUrl}" data-share-path="${escapedSharePath}" readonly>
	          <button id="copy-share-link" type="button">Copy</button>
	        </div>
	        <p class="copy-status" id="copy-status" role="status"></p>
	      </div>
	      <div class="preview-block">
	        <p class="preview-label">Social media preview</p>
	        <img src="${escapeHtml(imageUrl)}" alt="${escapedTitle}">
	      </div>
	      <div class="actions">
	        <a href="${escapeHtml(record.githubUrl)}">
	          <span>Open on GitHub</span>
          <span>&#8599;</span>
        </a>
	      </div>
	      <div class="footer">Served by <strong>mygh</strong></div>
	    </main>
	    <script${nonceAttribute}>
	      (() => {
	        const input = document.querySelector("#share-url");
	        const button = document.querySelector("#copy-share-link");
	        const status = document.querySelector("#copy-status");
	        if (!input || !button) return;

	        const sharePath = input.dataset.sharePath;
	        if (sharePath) {
	          input.value = new URL(sharePath, window.location.href).href;
	        }

	        const showCopied = () => {
	          button.textContent = "Copied";
	          if (status) status.textContent = "Copied.";
	          window.setTimeout(() => {
	            button.textContent = "Copy";
	            if (status) status.textContent = "";
	          }, 1600);
	        };

	        button.addEventListener("click", async () => {
	          try {
	            await navigator.clipboard.writeText(input.value);
	            showCopied();
	          } catch {
	            input.focus();
	            input.select();
	            if (document.execCommand && document.execCommand("copy")) {
	              showCopied();
	            } else if (status) {
	              status.textContent = "Copy the selected link.";
	            }
	          }
	        });
	      })();
	    </script>
	  </body>
	</html>`;
}

function requireKv(env: Env): KVNamespace {
  if (!env.MYGH_LINKS) {
    throw new HttpError(
      503,
      "MYGH_LINKS KV binding is not configured yet. Create a Cloudflare KV namespace and add it to wrangler.jsonc.",
    );
  }
  return env.MYGH_LINKS;
}

function validateStoredLinkRecord(
  value: LinkRecord | null,
  slug: string,
): LinkRecord | null {
  if (!value) {
    return null;
  }
  if (!isRecord(value) || !isTargetType(value.type)) {
    throw new HttpError(500, "Stored share link data is invalid.");
  }

  return {
    ...(value as LinkRecord),
    type: value.type,
    slug,
    sharePath: `/s/${slug}`,
    githubUrl: normalizeStoredGithubUrl(value.githubUrl),
    title: readStoredString(value.title, "title", 500),
    description: readStoredString(value.description, "description", 500),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTargetType(value: unknown): value is TargetType {
  return (
    value === "repo" ||
    value === "release" ||
    value === "file" ||
    value === "commit" ||
    value === "pull" ||
    value === "issue"
  );
}

function readStoredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new HttpError(500, `Stored share link ${field} is invalid.`);
  }
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength || /[\u0000-\u001f\u007f]/.test(cleaned)) {
    throw new HttpError(500, `Stored share link ${field} is invalid.`);
  }
  return cleaned;
}

function normalizeStoredGithubUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(500, "Stored share link target is invalid.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(500, "Stored share link target is invalid.");
  }
  if (
    parsed.protocol !== "https:" ||
    (parsed.hostname.toLowerCase() !== "github.com" &&
      parsed.hostname.toLowerCase() !== "www.github.com")
  ) {
    throw new HttpError(500, "Stored share link target is invalid.");
  }
  if (parsed.pathname.split("/").filter(Boolean).length < 2) {
    throw new HttpError(500, "Stored share link target is invalid.");
  }
  return parsed.href;
}

async function createSlug(kv: KVNamespace): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = randomSlug();
    const existing = await kv.get(`link:${slug}`);
    if (!existing) {
      return slug;
    }
  }
  throw new HttpError(500, "Could not create a unique share slug.");
}

function randomSlug(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodePngDataUrl(dataUrl: string): ArrayBuffer {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) {
    throw new HttpError(400, "imageDataUrl must be a PNG data URL.");
  }

  const encoded = dataUrl.slice(prefix.length);
  const maxEncodedLength = Math.ceil(MAX_PNG_BYTES / 3) * 4;
  if (encoded.length > maxEncodedLength) {
    throw new HttpError(413, "PNG image is too large.");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new HttpError(400, "imageDataUrl contains invalid base64.");
  }

  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new HttpError(400, "imageDataUrl contains invalid base64.");
  }
  if (binary.length > MAX_PNG_BYTES) {
    throw new HttpError(413, "PNG image is too large.");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (!hasPngSignature(bytes)) {
    throw new HttpError(400, "imageDataUrl must contain PNG bytes.");
  }
  return bytes.buffer;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function isCrawler(request: Request): boolean {
  const userAgent = request.headers.get("user-agent")?.toLowerCase() || "";
  return [
    "bot",
    "facebookexternalhit",
    "twitterbot",
    "slackbot",
    "linkedinbot",
    "discordbot",
    "whatsapp",
    "telegrambot",
    "pinterest",
    "embedly",
    "skypeuripreview",
  ].some((needle) => userAgent.includes(needle));
}

function isDevelopmentOnlyPath(pathname: string): boolean {
  return [
    "/dev/share-preview",
    "/dev/share-preview.svg",
    "/dev/preview-matrix",
    "/dev/preview-matrix.js",
  ].includes(pathname);
}

function isLocalDevelopmentRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  const hostHeader = request.headers.get("host");
  const connectingIp = request.headers.get("cf-connecting-ip") || "";
  return [hostname, hostHeader ? hostHeaderHostname(hostHeader) : ""].some(
    isLocalHostname,
  ) || isLocalIp(connectingIp);
}

function hostHeaderHostname(hostHeader: string): string {
  const host = hostHeader.trim();
  if (host.startsWith("[")) {
    const bracketIndex = host.indexOf("]");
    return bracketIndex === -1 ? host : host.slice(0, bracketIndex + 1);
  }
  return host.split(":")[0];
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "[::1]" ||
    normalized === "::1"
  );
}

function isLocalIp(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1";
}

function parseGithubNumber(value: string, label: string): number {
  const decoded = decodePathPart(value);
  const number = Number(decoded);
  if (!Number.isInteger(number) || number <= 0) {
    throw new HttpError(400, `Enter a valid GitHub ${label} number.`);
  }
  return number;
}

function requireGithubNumber(value: number | undefined, label: string): number {
  if (!Number.isInteger(value) || !value || value <= 0) {
    throw new HttpError(400, `Enter a valid GitHub ${label} number.`);
  }
  return value;
}

function isSafeGithubPathPart(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function cleanGithubPathValue(value: string, label: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 500 ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    throw new HttpError(400, `Unsupported GitHub ${label}.`);
  }
  return trimmed;
}

function decodePathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "GitHub URL contains invalid escaping.");
  }
}

function parseLineRange(hash: string): string | undefined {
  const match = hash.match(/^#L(\d+)(?:-L(\d+))?$/i);
  if (!match) {
    return undefined;
  }
  return match[2] ? `L${match[1]}-L${match[2]}` : `L${match[1]}`;
}

function encodeGithubPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function isHttpStatus(error: unknown, status: number): boolean {
  return error instanceof HttpError && error.status === status;
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function firstSentenceOrLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() || value;
}

function shortSha(value: string): string {
  return value.slice(0, 7);
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function detectLanguage(path: string): string | undefined {
  const extension = path.split(".").pop()?.toLowerCase();
  const languageByExtension: Record<string, string> = {
    c: "C",
    cc: "C++",
    cpp: "C++",
    cs: "C#",
    css: "CSS",
    go: "Go",
    html: "HTML",
    java: "Java",
    js: "JavaScript",
    json: "JSON",
    jsx: "JSX",
    md: "Markdown",
    mjs: "JavaScript",
    php: "PHP",
    py: "Python",
    rb: "Ruby",
    rs: "Rust",
    sh: "Shell",
    swift: "Swift",
    ts: "TypeScript",
    tsx: "TSX",
    txt: "Text",
    vue: "Vue",
    yaml: "YAML",
    yml: "YAML",
  };
  return extension ? languageByExtension[extension] : undefined;
}

function githubTypeLabel(type: TargetType): string {
  const labels: Record<TargetType, string> = {
    repo: "GitHub repository",
    release: "GitHub release",
    file: "GitHub file",
    commit: "GitHub commit",
    pull: "GitHub pull request",
    issue: "GitHub issue",
  };
  return labels[type];
}

function cleanLicenseValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = cleanText(value);
  return cleaned || undefined;
}

function cleanLicenseSpdxId(value: unknown): string | undefined {
  const cleaned = cleanLicenseValue(value);
  if (!cleaned || cleaned === "NOASSERTION") {
    return undefined;
  }
  return cleaned;
}

function withLineRange(url: string, lineRange: string | undefined): string {
  if (!lineRange) {
    return url;
  }
  try {
    const parsed = new URL(url);
    parsed.hash = lineRange;
    return parsed.href;
  } catch {
    return url;
  }
}

function cleanOverride(value: string | undefined, fallback: string, maxLength: number): string {
  const cleaned = cleanText(value || fallback);
  return truncate(cleaned, maxLength);
}

function cleanBodyOrFallback(value: string | undefined, fallback: string): string {
  const cleaned = cleanText(value || "");
  if (!cleaned || looksLikeEmptyGithubTemplate(cleaned)) {
    return fallback;
  }
  return cleaned;
}

function looksLikeEmptyGithubTemplate(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.startsWith("why: closes: what's being changed") ||
    normalized.startsWith("why: closes: check off the following")
  );
}

function cleanText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function normalizeTheme(value: string | undefined): string {
  if (value === "paper" || value === "dusk" || value === "mint") {
    return value;
  }
  return "paper";
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  const mediaType = contentType.toLowerCase().split(";")[0].trim();
  const isJson = mediaType === "application/json" || mediaType.endsWith("+json");
  if (!isJson) {
    throw new HttpError(415, "Request content type must be application/json.");
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_JSON_BODY_CHARS) {
    throw new HttpError(413, "Request body is too large.");
  }

  const bodyText = await request.text();
  if (bodyText.length > MAX_JSON_BODY_CHARS) {
    throw new HttpError(413, "Request body is too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${field} is required.`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return url.origin;
}

function json(data: unknown, status = 200): Response {
  const headers = new Headers(securityHeaders("no-store"));
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers,
  });
}

function shareHtmlHeaders(cacheControl: string, nonce: string): Headers {
  const headers = securityHeaders(cacheControl);
  headers.set(
    "content-security-policy",
    [
      "default-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'none'",
      "object-src 'none'",
    ].join("; "),
  );
  headers.set("content-type", "text/html; charset=utf-8");
  return headers;
}

function devPreviewMatrixHeaders(): Headers {
  const headers = securityHeaders("no-store");
  headers.set(
    "content-security-policy",
    [
      "default-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "script-src 'self'",
      "style-src 'unsafe-inline'",
      "connect-src 'none'",
      "object-src 'none'",
    ].join("; "),
  );
  headers.set("content-type", "text/html; charset=utf-8");
  return headers;
}

function securityHeaders(cacheControl: string): Headers {
  return new Headers({
    "cache-control": cacheControl,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.message }, error.status);
  }

  console.error(error);
  return json({ error: "Unexpected server error." }, 500);
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return value.replace(/[&<>"']/g, (char) => replacements[char]);
}
