export type WorkerEnv = Env & {
  GITHUB_TOKEN?: string;
};

export type TargetType = "repo" | "release" | "file" | "commit" | "pull" | "issue";

export interface GithubTarget {
  type: TargetType;
  owner: string;
  repo: string;
  tag?: string;
  ref?: string;
  path?: string;
  lineRange?: string;
  sha?: string;
  number?: number;
  requestedUrl: string;
}

export interface PreviewMetadata {
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
  licenseName?: string;
  licenseSpdxId?: string;
  releaseTag?: string;
  releaseName?: string;
  publishedAt?: string;
  assetsCount?: number;
  ref?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  fileSha?: string;
  lineRange?: string;
  commitSha?: string;
  commitAuthor?: string;
  committedAt?: string;
  changedFiles?: number;
  additions?: number;
  deletions?: number;
  number?: number;
  state?: string;
  author?: string;
  comments?: number;
  labels?: string[];
  draft?: boolean;
  mergedAt?: string;
}

export interface LinkRecord extends PreviewMetadata {
  version: 1;
  slug: string;
  createdAt: string;
  sharePath: string;
  theme: string;
}
