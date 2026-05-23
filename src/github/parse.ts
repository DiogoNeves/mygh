import { HttpError } from "../http.js";
import type { GithubTarget } from "../types.js";

const MAX_GITHUB_URL_LENGTH = 2048;

export function parseGithubUrl(rawUrl: string): GithubTarget {
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

function parseGithubNumber(value: string, label: string): number {
  const decoded = decodePathPart(value);
  const number = Number(decoded);
  if (!Number.isInteger(number) || number <= 0) {
    throw new HttpError(400, `Enter a valid GitHub ${label} number.`);
  }
  return number;
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
