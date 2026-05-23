import { HttpError } from "./http.js";
import { randomSlug } from "./random.js";
import type { LinkRecord, TargetType, WorkerEnv } from "./types.js";

const MAX_PNG_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function requireKv(env: WorkerEnv): KVNamespace {
  if (!env.MYGH_LINKS) {
    throw new HttpError(
      503,
      "MYGH_LINKS KV binding is not configured yet. Create a Cloudflare KV namespace and add it to wrangler.jsonc.",
    );
  }
  return env.MYGH_LINKS;
}

export function validateStoredLinkRecord(
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

export async function createSlug(kv: KVNamespace): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = randomSlug();
    const existing = await kv.get(`link:${slug}`);
    if (!existing) {
      return slug;
    }
  }
  throw new HttpError(500, "Could not create a unique share slug.");
}

export function decodePngDataUrl(dataUrl: string): ArrayBuffer {
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

export function normalizeTheme(value: string | undefined): string {
  if (value === "paper" || value === "dusk" || value === "mint") {
    return value;
  }
  return "paper";
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

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}
