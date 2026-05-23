import type { TargetType } from "../types.js";

export function githubTypeLabel(type: TargetType): string {
  const labels: Record<TargetType, string> = {
    repo: "GitHub repository",
    release: "GitHub release",
    file: "GitHub file",
    commit: "GitHub commit",
    pull: "GitHub pull request",
    issue: "GitHub issue",
  };
  return labels[type];
}
