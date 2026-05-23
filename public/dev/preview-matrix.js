import {
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  allInfoChips,
  buildPreviewState,
  drawPreviewImage,
  themes,
} from "/preview-card.js";

const samples = [
  {
    type: "repo",
    label: "Repository",
    metadata: {
      type: "repo",
      owner: "DiogoNeves",
      repo: "glide-obsidian",
      fullName: "DiogoNeves/glide-obsidian",
      githubUrl: "https://github.com/DiogoNeves/glide-obsidian",
      title: "glide-obsidian",
      description:
        "Self-evolving software for Obsidian: automate the boring bits, coach the meaningful ones.",
      language: "TypeScript",
      stars: 128,
      forks: 12,
      openIssues: 3,
      licenseSpdxId: "MIT",
      licenseName: "MIT License",
    },
  },
  {
    type: "release",
    label: "Release",
    metadata: {
      type: "release",
      owner: "DiogoNeves",
      repo: "mygh",
      fullName: "DiogoNeves/mygh",
      githubUrl: "https://github.com/DiogoNeves/mygh/releases/tag/v0.4.0",
      title: "v0.4.0: Rich GitHub previews",
      description:
        "Adds polished cards for releases, files, commits, pull requests, and issues.",
      language: "TypeScript",
      stars: 82,
      forks: 7,
      openIssues: 2,
      releaseTag: "v0.4.0",
      releaseName: "Rich GitHub previews",
      assetsCount: 4,
    },
  },
  {
    type: "file",
    label: "File",
    metadata: {
      type: "file",
      owner: "DiogoNeves",
      repo: "mygh",
      fullName: "DiogoNeves/mygh",
      githubUrl: "https://github.com/DiogoNeves/mygh/blob/main/src/index.ts#L85-L128",
      title: "src/index.ts",
      description:
        "Worker routing, GitHub metadata fetching, saved share links, and Open Graph responses.",
      language: "TypeScript",
      stars: 82,
      forks: 7,
      openIssues: 2,
      filePath: "src/index.ts",
      fileName: "index.ts",
      fileSize: 38912,
      ref: "main",
      lineRange: "L85-L128",
    },
  },
  {
    type: "commit",
    label: "Commit",
    metadata: {
      type: "commit",
      owner: "DiogoNeves",
      repo: "mygh",
      fullName: "DiogoNeves/mygh",
      githubUrl: "https://github.com/DiogoNeves/mygh/commit/abc1234",
      title: "Render every GitHub target as a distinct card",
      description:
        "Extracts preview metadata and draws type-specific chips across all supported GitHub links.",
      language: "TypeScript",
      stars: 82,
      forks: 7,
      openIssues: 2,
      commitSha: "abc1234def5678",
      commitAuthor: "Diogo Neves",
      changedFiles: 6,
      additions: 248,
      deletions: 31,
    },
  },
  {
    type: "pull",
    label: "Pull request",
    metadata: {
      type: "pull",
      owner: "DiogoNeves",
      repo: "mygh",
      fullName: "DiogoNeves/mygh",
      githubUrl: "https://github.com/DiogoNeves/mygh/pull/42",
      title: "Support rich previews for every GitHub URL type",
      description:
        "Adds inspectors and social preview cards for files, commits, PRs, issues, releases, and repositories.",
      language: "TypeScript",
      stars: 82,
      forks: 7,
      openIssues: 2,
      number: 42,
      state: "open",
      author: "DiogoNeves",
      comments: 9,
      changedFiles: 11,
    },
  },
  {
    type: "issue",
    label: "Issue",
    metadata: {
      type: "issue",
      owner: "DiogoNeves",
      repo: "mygh",
      fullName: "DiogoNeves/mygh",
      githubUrl: "https://github.com/DiogoNeves/mygh/issues/17",
      title: "Preview cards should stay readable on narrow screens",
      description:
        "Track responsive spacing, chip wrapping, and save-link placement across the studio layout.",
      language: "TypeScript",
      stars: 82,
      forks: 7,
      openIssues: 2,
      number: 17,
      state: "open",
      author: "DiogoNeves",
      comments: 5,
      labels: ["design", "responsive"],
    },
  },
];

const themeNames = Object.keys(themes);
const matrix = document.querySelector("#preview-matrix");

renderMatrix();

function renderMatrix() {
  const fragment = document.createDocumentFragment();
  fragment.append(headerRow());

  for (const sample of samples) {
    const row = document.createElement("section");
    row.className = "matrix-row";
    row.setAttribute("aria-label", `${sample.label} previews`);

    const label = document.createElement("div");
    label.className = "row-label";
    label.innerHTML = `<span>${sample.label}</span><code>${sample.metadata.githubUrl}</code>`;
    row.append(label);

    for (const themeName of themeNames) {
      row.append(cardCell(sample, themeName));
    }

    fragment.append(row);
  }

  matrix.replaceChildren(fragment);
}

function headerRow() {
  const row = document.createElement("div");
  row.className = "matrix-row matrix-header";
  row.append(document.createElement("span"));

  for (const themeName of themeNames) {
    const heading = document.createElement("span");
    heading.textContent = themeName;
    row.append(heading);
  }

  return row;
}

function cardCell(sample, themeName) {
  const cell = document.createElement("figure");
  cell.className = "matrix-cell";

  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_WIDTH;
  canvas.height = PREVIEW_HEIGHT;
  canvas.setAttribute(
    "aria-label",
    `${sample.label} ${themeName} preview image`,
  );
  drawPreviewImage(
    canvas.getContext("2d"),
    buildPreviewState(sample.metadata),
    themes[themeName],
    themeName,
    allInfoChips(),
  );

  const caption = document.createElement("figcaption");
  caption.textContent = `${sample.label} / ${themeName}`;

  cell.append(canvas, caption);
  return cell;
}
