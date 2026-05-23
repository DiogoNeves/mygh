import {
  devPreviewMatrixHeaders,
  getBaseUrl,
  HttpError,
  isLocalDevelopmentRequest,
  securityHeaders,
  shareHtmlHeaders,
} from "../http.js";
import { randomNonce } from "../random.js";
import {
  devShareRecord,
  renderDevPreviewMatrixHtml,
  renderDevSharePreviewSvg,
} from "../dev-pages.js";
import { renderShareHtml } from "../share-page.js";
import type { WorkerEnv } from "../types.js";

const DEVELOPMENT_ONLY_PATHS = [
  "/dev/share-preview",
  "/dev/share-preview.svg",
  "/dev/preview-matrix",
  "/dev/preview-matrix.js",
];

export function isDevelopmentOnlyPath(pathname: string): boolean {
  return DEVELOPMENT_ONLY_PATHS.includes(pathname);
}

export async function handleDevelopmentRoute(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  if (!isLocalDevelopmentRequest(request)) {
    throw new HttpError(404, "Not found.");
  }

  const pathname = new URL(request.url).pathname;
  if (pathname === "/dev/share-preview") {
    return handleDevSharePreview(request);
  }
  if (pathname === "/dev/share-preview.svg") {
    return handleDevSharePreviewImage();
  }
  if (pathname === "/dev/preview-matrix") {
    return handleDevPreviewMatrix();
  }
  return await handleDevAsset(request, env);
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

async function handleDevAsset(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.ASSETS) {
    throw new HttpError(404, "Not found.");
  }

  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  securityHeaders("no-store").forEach((value, key) => headers.set(key, value));

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
