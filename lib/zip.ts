
import JSZip from "jszip";
import { InspectionReport } from "./types";

function sanitizeZipPath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, "/")
    .split("/")
    .filter(
      (segment) =>
        segment &&
        segment !== "." &&
        segment !== ".."
    )
    .map((segment) =>
      segment.replace(/[^a-zA-Z0-9._-]/g, "_")
    )
    .join("/");
}

function getFileName(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);

    const pathname = parsed.pathname
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean);

    const filename = pathname[pathname.length - 1];

    return sanitizeZipPath(filename || fallback);
  } catch {
    return fallback;
  }
}

function getFolder(type: string): string {
  switch (type.toUpperCase()) {
    case "HTML":
      return "html";

    case "CSS":
      return "css";

    case "JS":
      return "js";

    case "JSON":
      return "json";

    case "IMAGE":
      return "images";

    case "FONT":
      return "fonts";

    case "XML":
      return "xml";

    default:
      return "other";
  }
}

function uniqueName(
  folder: string,
  filename: string,
  used: Set<string>
): string {
  const safeFolder = sanitizeZipPath(folder);
  const safeFilename = sanitizeZipPath(filename);

  const dot = safeFilename.lastIndexOf(".");

  const base =
    dot > 0
      ? safeFilename.slice(0, dot)
      : safeFilename;

  const extension =
    dot > 0
      ? safeFilename.slice(dot)
      : "";

  let index = 0;

  while (true) {
    const name =
      index === 0
        ? safeFilename
        : `${base}_${index}${extension}`;

    const path = `${safeFolder}/${name}`;

    if (!used.has(path)) {
      used.add(path);
      return path;
    }

    index++;
  }
}

export async function buildInspectionZip(
  report: InspectionReport
): Promise<Blob> {
  const zip = new JSZip();

  const root = zip.folder("inspected-site");

  if (!root) {
    throw new Error("Failed to create ZIP root");
  }

  const usedPaths = new Set<string>();

  for (const resource of report.resources) {
    if (resource.content === undefined) {
      continue;
    }

    const type = resource.type.toUpperCase();
    const folder = getFolder(type);

    let fallback = "resource";

    switch (type) {
      case "HTML":
        fallback = "document.html";
        break;

      case "CSS":
        fallback = "style.css";
        break;

      case "JS":
        fallback = "script.js";
        break;

      case "JSON":
        fallback = "data.json";
        break;

      case "IMAGE":
        fallback = "image";
        break;

      case "FONT":
        fallback = "font";
        break;

      case "XML":
        fallback = "document.xml";
        break;

      default:
        fallback = "resource";
    }

    const filename = getFileName(
      resource.url,
      fallback
    );

    const path = uniqueName(
      folder,
      filename,
      usedPaths
    );

    root.file(path, resource.content);
  }

  const metadata = root.folder("metadata");

  if (!metadata) {
    throw new Error("Failed to create metadata folder");
  }

  metadata.file(
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

  metadata.file(
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

  metadata.file(
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

  return await zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
    compressionOptions: {
      level: 6,
    },
  });
}