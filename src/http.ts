const MAX_JSON_BODY_CHARS = 3_000_000;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
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

export function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${field} is required.`);
  }
  return value.trim();
}

export function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  const hostHeader = request.headers.get("host");
  if (hostHeader && isLocalHostname(hostHeaderHostname(hostHeader))) {
    return `${url.protocol}//${hostHeader.trim()}`;
  }
  return url.origin;
}

export function json(data: unknown, status = 200): Response {
  const headers = new Headers(securityHeaders("no-store"));
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers,
  });
}

export function shareHtmlHeaders(cacheControl: string, nonce: string): Headers {
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

export function devPreviewMatrixHeaders(): Headers {
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

export function securityHeaders(cacheControl: string): Headers {
  return new Headers({
    "cache-control": cacheControl,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.message }, error.status);
  }

  console.error(error);
  return json({ error: "Unexpected server error." }, 500);
}

export function isCrawler(request: Request): boolean {
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

export function isLocalDevelopmentRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  const hostHeader = request.headers.get("host");
  const connectingIp = request.headers.get("cf-connecting-ip") || "";
  return [hostname, hostHeader ? hostHeaderHostname(hostHeader) : ""].some(
    isLocalHostname,
  ) || isLocalIp(connectingIp);
}

export function hostHeaderHostname(hostHeader: string): string {
  const host = hostHeader.trim();
  if (host.startsWith("[")) {
    const bracketIndex = host.indexOf("]");
    return bracketIndex === -1 ? host : host.slice(0, bracketIndex + 1);
  }
  return host.split(":")[0];
}

export function isLocalHostname(hostname: string): boolean {
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
