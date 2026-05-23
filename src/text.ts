export function cleanOverride(
  value: string | undefined,
  fallback: string,
  maxLength: number,
): string {
  const cleaned = cleanText(value || fallback);
  return truncate(cleaned, maxLength);
}

export function cleanBodyOrFallback(
  value: string | undefined,
  fallback: string,
): string {
  const cleaned = cleanText(value || "");
  if (!cleaned || looksLikeEmptyGithubTemplate(cleaned)) {
    return fallback;
  }
  return cleaned;
}

export function cleanText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

export function firstSentenceOrLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() || value;
}

export function shortSha(value: string): string {
  return value.slice(0, 7);
}

export function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

export function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return value.replace(/[&<>"']/g, (char) => replacements[char]);
}

function looksLikeEmptyGithubTemplate(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.startsWith("why: closes: what's being changed") ||
    normalized.startsWith("why: closes: check off the following")
  );
}
