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

      if (request.method === "GET" && isDevSharePreviewPath(url.pathname)) {
        if (!isLocalDevelopmentRequest(request)) {
          throw new HttpError(404, "Not found.");
        }
        if (url.pathname === "/dev/share-preview") {
          return handleDevSharePreview(request);
        }
        return handleDevSharePreviewImage();
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

function handleDevSharePreview(request: Request): Response {
  const baseUrl = getBaseUrl(request);
  return new Response(
    renderShareHtml(
      devShareRecord(),
      baseUrl,
      "/dev/share-preview.svg",
    ),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function handleDevSharePreviewImage(): Response {
  return new Response(renderDevSharePreviewSvg(), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
    },
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
  <text x="1070" y="136" fill="#f05a3f" font-family="Georgia, serif" font-size="30" font-weight="700" text-anchor="end">mygh</text>
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

function renderShareHtml(
  record: LinkRecord,
  baseUrl: string,
  imageUrl = `${baseUrl}/img/${record.slug}.png`,
): string {
  const shareUrl = `${baseUrl}${record.sharePath}`;
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
	      :root {
	        --page: #e8edf0;
	        --surface: #fbfdfb;
	        --surface-2: #f2f6f3;
	        --ink: #141616;
	        --muted: #626b68;
	        --line: #cbd5d0;
	        --line-strong: #9eaaa5;
	        --press: #0d1010;
	        --accent: #f05a3f;
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
	      img {
	        aspect-ratio: 1200 / 630;
	        background: var(--surface);
	        border: 1px solid var(--line-strong);
	        border-radius: 8px;
	        box-shadow: 18px 18px 0 rgba(20, 22, 22, 0.08), var(--soft-shadow);
	        display: block;
	        height: auto;
	        margin: 0 0 24px;
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

function isDevSharePreviewPath(pathname: string): boolean {
  return pathname === "/dev/share-preview" || pathname === "/dev/share-preview.svg";
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
