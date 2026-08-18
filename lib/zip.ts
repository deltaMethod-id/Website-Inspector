import JSZip from "jszip";
import { InspectionReport } from "./types";

/**
 * Removes path traversal and absolute-path components.
 * The returned path is always relative.
 */
function sanitizeZipPath(rawPath: string): string {
  const normalized = rawPath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".."
    )
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "_"));

  return normalized.join("/") || "unnamed";
}

function pathForPage(pageUrl: string): string {
  const url = new URL(pageUrl);

  let pathname = url.pathname;

  if (!pathname || pathname === "/") {
    return "pages/index.html";
  }

  pathname = pathname.replace(/^\/+/, "");

  if (pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const safePath = sanitizeZipPath(pathname);

  return `pages/${safePath}/index.html`;
}

function folderForResourceType(type: string): string {
  switch (type.toUpperCase()) {
    case "CSS":
      return "css";

    case "JS":
      return "js";

    case "IMAGE":
      return "images";

    case "FONT":
      return "fonts";

    default:
      return "other";
  }
}

function fileNameForResource(resourceUrl: string): string {
  const url = new URL(resourceUrl);

  const pathname = url.pathname.replace(/\\/g, "/");

  const baseName =
    pathname
      .split("/")
      .filter(Boolean)
      .pop() || "resource";

  const safeName = sanitizeZipPath(baseName);

  return safeName || "resource";
}

function uniqueAssetPath(
  folder: string,
  fileName: string,
  usedNames: Set<string>
): string {
  const safeFolder = sanitizeZipPath(folder);
  const safeName = sanitizeZipPath(fileName);

  const extensionIndex = safeName.lastIndexOf(".");
  const hasExtension =
    extensionIndex > 0 && extensionIndex < safeName.length - 1;

  const baseName = hasExtension
    ? safeName.slice(0, extensionIndex)
    : safeName;

  const extension = hasExtension
    ? safeName.slice(extensionIndex)
    : "";

  let attempt = 0;
  let candidate = `${safeFolder}/${safeName}`;

  while (usedNames.has(candidate)) {
    attempt++;

    candidate = `${safeFolder}/${baseName}_${attempt}${extension}`;
  }

  usedNames.add(candidate);

  return candidate;
}

export async function buildInspectionZip(
  report: InspectionReport
): Promise<Uint8Array> {
  const zip = new JSZip();

  const root = zip.folder("inspected-site");

  if (!root) {
    throw new Error("Failed to create inspected-site ZIP folder");
  }

  // -------------------------
  // Pages
  // -------------------------

  const pagesFolder = root.folder("pages");

  if (!pagesFolder) {
    throw new Error("Failed to create pages ZIP folder");
  }

  for (const page of report.pages) {
    const resource = report.resources.find(
      (resource) =>
        resource.type === "HTML" &&
        resource.url === page.url
    );

    if (resource?.content === undefined) {
      continue;
    }

    const pagePath = pathForPage(page.url);

    // Remove "pages/" because we're already inside pagesFolder.
    const relativePath = pagePath.replace(/^pages\//, "");

    pagesFolder.file(relativePath, resource.content);
  }

  // -------------------------
  // Assets
  // -------------------------

  const assetsFolder = root.folder("assets");

  if (!assetsFolder) {
    throw new Error("Failed to create assets ZIP folder");
  }

  const usedNames = new Set<string>();

  for (const resource of report.resources) {
    if (resource.type.toUpperCase() === "HTML") {
      continue;
    }

    if (resource.content === undefined) {
      continue;
    }

    const folder = folderForResourceType(resource.type);

    const fileName = fileNameForResource(resource.url);

    const assetPath = uniqueAssetPath(
      folder,
      fileName,
      usedNames
    );

    // IMPORTANT:
    // assetPath already contains the correct folder:
    //
    // css/style.css
    // js/app.js
    // images/logo.png
    //
    // Do NOT strip the first directory here.
    assetsFolder.file(assetPath, resource.content);
  }

  // -------------------------
  // Metadata
  // -------------------------

  const metadataFolder = root.folder("metadata");

  if (!metadataFolder) {
    throw new Error("Failed to create metadata ZIP folder");
  }

  metadataFolder.file(
    "site.json",
    JSON.stringify(
      {
        target: report.target,
        metadata: report.metadata,
        stats: report.stats,
      },
      null,
      2
    )
  );

  metadataFolder.file(
    "links.json",
    JSON.stringify(
      report.pages.map((page) => ({
        url: page.url,
        path: page.path,
        depth: page.depth,
        status: page.status,
      })),
      null,
      2
    )
  );

  metadataFolder.file(
    "report.json",
    JSON.stringify(
      {
        target: report.target,
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
        options: report.options,
        stats: report.stats,
        errors: report.errors,
        limitsReached: report.limitsReached,
      },
      null,
      2
    )
  );

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
}