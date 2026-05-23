import { HttpError } from "../http.js";
import {
  capitalize,
  cleanBodyOrFallback,
  cleanText,
  firstSentenceOrLine,
  numberOrUndefined,
  shortSha,
  truncate,
} from "../text.js";
import type { GithubTarget, PreviewMetadata, WorkerEnv } from "../types.js";
import {
  fetchGithubFileContent,
  fetchGithubRepo,
  githubFetch,
  type GithubApiRecord,
} from "./client.js";

export async function fetchGithubMetadata(
  target: GithubTarget,
  env: WorkerEnv,
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

async function fetchReleaseMetadata(
  target: GithubTarget,
  repo: GithubApiRecord,
  base: PreviewMetadata,
  env: WorkerEnv,
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
  repo: GithubApiRecord,
  base: PreviewMetadata,
  env: WorkerEnv,
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
  repo: GithubApiRecord,
  base: PreviewMetadata,
  env: WorkerEnv,
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
  repo: GithubApiRecord,
  base: PreviewMetadata,
  env: WorkerEnv,
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
  repo: GithubApiRecord,
  base: PreviewMetadata,
  env: WorkerEnv,
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
        .map((label: GithubApiRecord) => cleanText(String(label.name || "")))
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

function requireGithubNumber(value: number | undefined, label: string): number {
  if (!Number.isInteger(value) || !value || value <= 0) {
    throw new HttpError(400, `Enter a valid GitHub ${label} number.`);
  }
  return value;
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
