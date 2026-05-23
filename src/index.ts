interface Env {
  ASSETS?: Fetcher;
  MYGH_LINKS?: KVNamespace;
  GITHUB_TOKEN?: string;
}

type TargetType = "repo" | "release";

interface GithubTarget {
  type: TargetType;
  owner: string;
  repo: string;
  tag?: string;
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
  releaseTag?: string;
  releaseName?: string;
  publishedAt?: string;
  assetsCount?: number;
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
  const kv = requireKv(env);
  const body = await readJson(request);
  const githubUrl = readRequiredString(body.githubUrl, "githubUrl");
  const imageDataUrl = readOptionalString(body.imageDataUrl);
  const theme = normalizeTheme(readOptionalString(body.theme));

  const target = parseGithubUrl(githubUrl);
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

  if (imageDataUrl) {
    const image = decodePngDataUrl(imageDataUrl);
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
    },
  });
}

async function handleShare(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const kv = requireKv(env);
  const record = await kv.get<LinkRecord>(`link:${slug}`, "json");
  if (!record) {
    throw new HttpError(404, "Share link not found.");
  }

  const url = new URL(request.url);
  const forcePreview = url.searchParams.get("preview") === "1";
  if (!forcePreview && !isCrawler(request)) {
    return Response.redirect(record.githubUrl, 302);
  }

  const baseUrl = getBaseUrl(request);
  return new Response(renderShareHtml(record, baseUrl), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

function parseGithubUrl(rawUrl: string): GithubTarget {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "Enter a valid GitHub URL.");
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    throw new HttpError(400, "Only github.com URLs are supported.");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new HttpError(400, "Enter a GitHub repository or release URL.");
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
      tag: decodePathPart(parts.slice(4).join("/")),
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

  return { type: "repo", owner, repo, requestedUrl: rawUrl };
}

async function fetchGithubMetadata(
  target: GithubTarget,
  env: Env,
): Promise<PreviewMetadata> {
  const repo = await githubFetch(
    `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`,
    env,
  );

  const base: PreviewMetadata = {
    type: target.type,
    owner: repo.owner.login,
    repo: repo.name,
    fullName: repo.full_name,
    githubUrl: repo.html_url,
    title: repo.full_name,
    description: truncate(cleanText(repo.description || "A GitHub repository."), 220),
    language: repo.language || undefined,
    stars: Number(repo.stargazers_count || 0),
    forks: Number(repo.forks_count || 0),
    openIssues: Number(repo.open_issues_count || 0),
    ownerAvatarUrl: repo.owner.avatar_url || undefined,
  };

  if (target.type === "repo") {
    return base;
  }

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
    title: `${repo.full_name} ${releaseTitle}`,
    description: releaseDescription,
    releaseTag: release.tag_name,
    releaseName: release.name || undefined,
    publishedAt: release.published_at || release.created_at || undefined,
    assetsCount: Array.isArray(release.assets) ? release.assets.length : 0,
  };
}

async function githubFetch(url: string, env: Env): Promise<Record<string, any>> {
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
      throw new HttpError(404, "GitHub repository or release not found.");
    }
    if (response.status === 403) {
      throw new HttpError(502, "GitHub rate limit reached. Try again later.");
    }
    throw new HttpError(502, `GitHub returned ${response.status}.`);
  }

  return response.json();
}

function renderShareHtml(record: LinkRecord, baseUrl: string): string {
  const shareUrl = `${baseUrl}${record.sharePath}`;
  const imageUrl = `${baseUrl}/img/${record.slug}.png`;
  const typeLabel = record.type === "release" ? "GitHub release" : "GitHub repository";
  const escapedTitle = escapeHtml(record.title);
  const escapedDescription = escapeHtml(record.description);

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

    <style>
      * { box-sizing: border-box; }
      body {
        align-items: center;
        background:
          radial-gradient(circle at top left, rgba(36, 88, 255, 0.08), transparent 30%),
          #f7f8fb;
        color: #0b1220;
        display: grid;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        min-height: 100vh;
        padding: 18px;
      }
      main {
        background: #ffffff;
        border: 1px solid #e3e7ef;
        border-radius: 8px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.10);
        margin: auto;
        max-width: 430px;
        overflow: hidden;
        padding: 32px 20px 0;
        width: 100%;
      }
      .brand {
        align-items: center;
        display: flex;
        font-size: 20px;
        font-weight: 850;
        gap: 10px;
        margin-bottom: 46px;
      }
      .brand-mark {
        align-items: center;
        background: linear-gradient(145deg, #2458ff, #1f6fff);
        border-radius: 8px;
        color: #ffffff;
        display: inline-flex;
        height: 34px;
        justify-content: center;
        width: 34px;
      }
      .brand span:last-child span {
        color: #2458ff;
      }
      .ready {
        align-items: center;
        display: grid;
        gap: 13px;
        grid-template-columns: auto minmax(0, 1fr);
        margin-bottom: 20px;
      }
      .check {
        align-items: center;
        background: rgba(53, 180, 119, 0.15);
        border-radius: 999px;
        color: #35b477;
        display: inline-flex;
        font-size: 22px;
        height: 40px;
        justify-content: center;
        width: 40px;
      }
      h1 {
        font-size: 16px;
        line-height: 1.25;
        margin: 0 0 4px;
      }
      p {
        color: #687083;
        font-size: 14px;
        margin: 0;
      }
      img {
        border: 1px solid #e3e7ef;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        display: block;
        height: auto;
        margin: 24px 0;
        max-width: 100%;
      }
      .actions {
        border: 1px solid #e3e7ef;
        border-radius: 8px;
        overflow: hidden;
      }
      a {
        align-items: center;
        color: #0b1220;
        display: flex;
        font-size: 14px;
        font-weight: 760;
        justify-content: space-between;
        min-height: 54px;
        padding: 0 16px;
        text-decoration: none;
      }
      .footer {
        border-top: 1px solid #e3e7ef;
        color: #687083;
        font-size: 13px;
        margin: 32px -20px 0;
        min-height: 72px;
        display: grid;
        place-items: center;
      }
      .footer strong { color: #2458ff; }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <span class="brand-mark">my</span>
        <span>my<span>gh</span></span>
      </div>
      <div class="ready">
        <span class="check">&#10003;</span>
        <div>
          <h1>Your link is ready!</h1>
          <p>${escapeHtml(typeLabel)} preview by mygh.</p>
        </div>
      </div>
      <img src="${escapeHtml(imageUrl)}" alt="${escapedTitle}">
      <div class="actions">
        <a href="${escapeHtml(record.githubUrl)}">
          <span>Open on GitHub</span>
          <span>&#8599;</span>
        </a>
      </div>
      <div class="footer">Served by <strong>mygh</strong></div>
    </main>
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

function decodePngDataUrl(dataUrl: string): ArrayBuffer {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) {
    throw new HttpError(400, "imageDataUrl must be a PNG data URL.");
  }

  const binary = atob(dataUrl.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
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

function isSafeGithubPathPart(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function decodePathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "GitHub URL contains invalid escaping.");
  }
}

function cleanOverride(value: string | undefined, fallback: string, maxLength: number): string {
  const cleaned = cleanText(value || fallback);
  return truncate(cleaned, maxLength);
}

function cleanText(value: string): string {
  return value
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
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid body.");
    }
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
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
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
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
