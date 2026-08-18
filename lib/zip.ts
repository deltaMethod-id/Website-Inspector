import JSZip from "jszip";
import { InspectionReport } from "./types";

/**
 * Removes any path traversal or absolute-path components so that every
 * entry we add to the archive stays inside `inspected-site/`.
 */
function sanitizeZipPath(rawPath: string): string {
  const segments = rawPath
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  const cleaned = segments
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "_"))
    .join("/");
  return cleaned || "unnamed";
}

function pathForPage(pageUrl: string): string {
  const url = new URL(pageUrl);
  let pathname = url.pathname;
  if (pathname === "" || pathname === "/") {
    return "pages/index.html";
  }
  if (pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  const safe = sanitizeZipPath(pathname);
  return `pages/${safe}/index.html`;
}

function folderForResourceType(type: string): string {
  switch (type) {
    case "CSS":
      return "assets/css";
    case "JS":
      return "assets/js";
    case "IMAGE":
      return "assets/images";
    case "FONT":
      return "assets/fonts";
    default:
      return "assets/other";
  }
}

function fileNameForResource(resourceUrl: string): string {
  const url = new URL(resourceUrl);
  const base = url.pathname.split("/").filter(Boolean).pop() || "resource";
  return sanitizeZipPath(base);
}

export async function buildInspectionZip(report: InspectionReport): Promise<Uint8Array> {
  const zip = new JSZip();
  const root = zip.folder("inspected-site")!;

  const pagesFolder = root.folder("pages")!;
  for (const page of report.pages) {
    const resource = report.resources.find(
      (r) => r.type === "HTML" && r.url === page.url
    );
    if (!resource?.content) continue;
    const relativePath = pathForPage(page.url).replace(/^pages\//, "");
    pagesFolder.file(relativePath, resource.content);
  }

  const assetsFolder = root.folder("assets")!;
  const usedNames = new Set<string>();
  for (const resource of report.resources) {
    if (resource.type === "HTML") continue;
    const folder = folderForResourceType(resource.type).replace(/^assets\//, "");
    let name = fileNameForResource(resource.url);
    let attempt = 0;
    let candidate = `${folder}/${name}`;
    while (usedNames.has(candidate)) {
      attempt += 1;
      const dot = name.lastIndexOf(".");
      const withSuffix =
        dot > 0 ? `${name.slice(0, dot)}_${attempt}${name.slice(dot)}` : `${name}_${attempt}`;
      candidate = `${folder}/${withSuffix}`;
    }
    usedNames.add(candidate);
    if (resource.content !== undefined) {
      assetsFolder.file(candidate.replace(/^[^/]+\//, ""), resource.content);
    }
  }

  const metadataFolder = root.folder("metadata")!;
  metadataFolder.file(
    "site.json",
    JSON.stringify(
      { target: report.target, metadata: report.metadata, stats: report.stats },
      null,
      2
    )
  );
  metadataFolder.file(
    "links.json",
    JSON.stringify(
      report.pages.map((p) => ({ url: p.url, path: p.path, depth: p.depth, status: p.status })),
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

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
