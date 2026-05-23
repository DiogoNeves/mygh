import { getBaseUrl, HttpError, isCrawler, shareHtmlHeaders } from "../http.js";
import { requireKv, validateStoredLinkRecord } from "../link-records.js";
import { randomNonce } from "../random.js";
import { renderShareHtml } from "../share-page.js";
import type { LinkRecord, WorkerEnv } from "../types.js";

export async function handleImage(
  request: Request,
  slug: string,
  env: WorkerEnv,
): Promise<Response> {
  const kv = requireKv(env);
  const image = await kv.get(`image:${slug}`, "arrayBuffer");
  if (!image) {
    throw new HttpError(404, "Image not found.");
  }

  const headers = new Headers({
    "content-type": "image/png",
    "content-length": String(image.byteLength),
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });

  return new Response(request.method === "HEAD" ? null : image, {
    headers,
  });
}

export async function handleShare(
  request: Request,
  env: WorkerEnv,
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
  const html = renderShareHtml(record, baseUrl, undefined, nonce);
  return new Response(request.method === "HEAD" ? null : html, {
    headers: shareHtmlHeaders("public, max-age=300", nonce),
  });
}
