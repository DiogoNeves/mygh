import { HttpError } from "../http.js";
import type { GithubTarget, WorkerEnv } from "../types.js";

export type GithubApiRecord = Record<string, any>;

export function fetchGithubRepo(
  target: Pick<GithubTarget, "owner" | "repo">,
  env: WorkerEnv,
): Promise<GithubApiRecord> {
  return githubFetch(
    `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`,
    env,
  );
}

export async function fetchGithubFileContent(
  target: GithubTarget,
  env: WorkerEnv,
): Promise<GithubApiRecord | GithubApiRecord[]> {
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

export async function githubFetch(
  url: string,
  env: WorkerEnv,
): Promise<GithubApiRecord> {
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

function encodeGithubPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function isHttpStatus(error: unknown, status: number): boolean {
  return error instanceof HttpError && error.status === status;
}
