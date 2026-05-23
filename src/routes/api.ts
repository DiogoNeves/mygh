import { fetchGithubMetadata, parseGithubUrl } from "../github.js";
import {
  getBaseUrl,
  json,
  readJson,
  readOptionalString,
  readRequiredString,
  HttpError,
} from "../http.js";
import {
  createSlug,
  decodePngDataUrl,
  normalizeTheme,
  requireKv,
} from "../link-records.js";
import { cleanOverride } from "../text.js";
import type { LinkRecord, WorkerEnv } from "../types.js";

export async function handleInspect(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const githubUrl = url.searchParams.get("url");
  if (!githubUrl) {
    throw new HttpError(400, "Missing url query parameter.");
  }

  const target = parseGithubUrl(githubUrl);
  const metadata = await fetchGithubMetadata(target, env);

  return json({ target, metadata });
}

export async function handleCreateLink(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
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
