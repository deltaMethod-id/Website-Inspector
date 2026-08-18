import {
  DEFAULT_INSPECTION_OPTIONS,
  HARD_LIMITS,
  InspectedPage,
  InspectedResource,
  InspectionOptions,
  InspectionReport,
  ResourceType,
  SiteMetadata,
} from "./types";
import { isSameOrigin, normalizeUrl, validateUrlSafety } from "./url-security";

const USER_AGENT = "WebsiteInspector/1.0 (+public-resource-inspection)";

function clampOptions(input: Partial<InspectionOptions>): InspectionOptions {
  return {
    maxPages: Math.min(
      Math.max(1, input.maxPages ?? DEFAULT_INSPECTION_OPTIONS.maxPages),
      HARD_LIMITS.maxPages
    ),
    maxDepth: Math.min(Math.max(0, input.maxDepth ?? DEFAULT_INSPECTION_OPTIONS.maxDepth), 5),
    timeoutMs: Math.min(
      Math.max(1000, input.timeoutMs ?? DEFAULT_INSPECTION_OPTIONS.timeoutMs),
      20000
    ),
    sameOriginOnly: input.sameOriginOnly ?? DEFAULT_INSPECTION_OPTIONS.sameOriginOnly,
    respectRobots: input.respectRobots ?? DEFAULT_INSPECTION_OPTIONS.respectRobots,
  };
}

function classifyResource(url: string, contentType: string): ResourceType {
  const ct = contentType.toLowerCase();
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  if (ct.includes("text/html")) return "HTML";
  if (ct.includes("text/css")) return "CSS";
  if (
    ct.includes("javascript") ||
    ct.includes("ecmascript") ||
    /\.(m?js)(\?|$)/.test(path)
  )
    return "JS";
  if (ct.includes("json") || /\.json(\?|$)/.test(path)) return "JSON";
  if (ct.includes("xml") || /\.(xml|rss|atom)(\?|$)/.test(path)) return "XML";
  if (
    ct.startsWith("image/") ||
    /\.(png|jpe?g|gif|svg|webp|ico|avif|bmp)(\?|$)/.test(path)
  )
    return "IMAGE";
  if (
    ct.includes("font") ||
    /\.(woff2?|ttf|otf|eot)(\?|$)/.test(path)
  )
    return "FONT";
  return "OTHER";
}

function isCompiledBundle(url: string, content: string): boolean {
  // Original TSX/JSX/TS source is never served directly by a production
  // server — what browsers receive is always a compiled/bundled artifact.
  // We label it honestly rather than implying it's original source.
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  if (/\.(ts|tsx|jsx)(\?|$)/.test(path)) return false; // would be unusual/misconfigured, but trust the extension
  return true;
}

interface RobotsRules {
  disallow: string[];
  sitemap: string | null;
}

async function fetchRobotsTxt(origin: string, timeoutMs: number): Promise<RobotsRules> {
  const robotsUrl = `${origin}/robots.txt`;
  const rules: RobotsRules = { disallow: [], sitemap: null };
  try {
    const safety = await validateUrlSafety(robotsUrl);
    if (!safety.safe) return rules;
    const res = await fetchWithTimeout(robotsUrl, timeoutMs);
    if (!res.ok) return rules;
    const text = await res.text();
    let applies = false;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const [rawKey, ...rest] = line.split(":");
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") {
        applies = value === "*" || value.toLowerCase().includes("websiteinspector");
      } else if (key === "disallow" && applies && value) {
        rules.disallow.push(value);
      } else if (key === "sitemap") {
        rules.sitemap = value;
      }
    }
  } catch {
    // No robots.txt or unreachable — treat as unrestricted.
  }
  return rules;
}

function isDisallowedByRobots(path: string, rules: RobotsRules): boolean {
  return rules.disallow.some((rule) => path.startsWith(rule));
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Follows redirects manually, re-validating SSRF safety on every hop. */
async function safeFetch(
  url: string,
  timeoutMs: number,
  maxRedirects = HARD_LIMITS.maxRedirects
): Promise<{ response: Response; finalUrl: string } | { error: string }> {
  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safety = await validateUrlSafety(currentUrl);
    if (!safety.safe) {
      return { error: safety.reason ?? "Blocked by SSRF protection" };
    }
    let response: Response;
    try {
      response = await fetchWithTimeout(currentUrl, timeoutMs);
    } catch (err) {
      return { error: `Request failed: ${(err as Error).message}` };
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) return { error: "Redirect without Location header" };
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return { error: "Invalid redirect target" };
      }
      continue;
    }
    return { response, finalUrl: currentUrl };
  }
  return { error: "Too many redirects" };
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const hrefRegex = /href\s*=\s*["']([^"'#][^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html))) {
    try {
      const resolved = new URL(match[1], baseUrl).toString();
      links.add(resolved);
    } catch {
      // ignore invalid links
    }
  }
  return Array.from(links);
}

function extractResourceRefs(html: string, baseUrl: string): string[] {
  const refs = new Set<string>();
  const patterns = [
    /<script[^>]+src\s*=\s*["']([^"']+)["']/gi,
    /<link[^>]+href\s*=\s*["']([^"']+)["']/gi,
    /<img[^>]+src\s*=\s*["']([^"']+)["']/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      try {
        refs.add(new URL(match[1], baseUrl).toString());
      } catch {
        // ignore
      }
    }
  }
  return Array.from(refs);
}

function extractMetadata(html: string): Partial<SiteMetadata> {
  const get = (regex: RegExp) => {
    const m = regex.exec(html);
    return m ? m[1].trim() : null;
  };
  return {
    title: get(/<title[^>]*>([^<]*)<\/title>/i),
    description: get(
      /<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["']([^"']*)["']/i
    ),
    ogTitle: get(
      /<meta[^>]+property\s*=\s*["']og:title["'][^>]+content\s*=\s*["']([^"']*)["']/i
    ),
    ogDescription: get(
      /<meta[^>]+property\s*=\s*["']og:description["'][^>]+content\s*=\s*["']([^"']*)["']/i
    ),
    canonical: get(
      /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']*)["']/i
    ),
    robots: get(
      /<meta[^>]+name\s*=\s*["']robots["'][^>]+content\s*=\s*["']([^"']*)["']/i
    ),
  };
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `res_${idCounter.toString(36)}`;
}

export async function inspectWebsite(
  targetUrl: string,
  rawOptions: Partial<InspectionOptions> = {}
): Promise<InspectionReport> {
  const options = clampOptions(rawOptions);
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const errors: string[] = [];
  const limitsReached: string[] = [];

  const initialSafety = await validateUrlSafety(targetUrl);
  if (!initialSafety.safe) {
    throw new Error(`Target is not allowed: ${initialSafety.reason}`);
  }

  const origin = new URL(targetUrl).origin;
  const robots = options.respectRobots
    ? await fetchRobotsTxt(origin, options.timeoutMs)
    : { disallow: [], sitemap: null };

  const visitedPages = new Set<string>();
  const visitedResources = new Set<string>();
  const pages: InspectedPage[] = [];
  const resources: InspectedResource[] = [];
  let metadata: SiteMetadata = {
    title: null,
    description: null,
    ogTitle: null,
    ogDescription: null,
    canonical: null,
    robots: null,
    sitemap: robots.sitemap,
  };

  const queue: Array<{ url: string; depth: number }> = [
    { url: normalizeUrl(targetUrl), depth: 0 },
  ];

  async function recordResource(
    url: string,
    forcedType?: ResourceType
  ): Promise<void> {
    const normalized = normalizeUrl(url);
    if (visitedResources.has(normalized)) return;
    if (resources.length >= HARD_LIMITS.maxResources) {
      if (!limitsReached.includes("maxResources")) limitsReached.push("maxResources");
      return;
    }
    if (options.sameOriginOnly && !isSameOrigin(normalized, targetUrl)) return;

    visitedResources.add(normalized);
    const result = await safeFetch(normalized, options.timeoutMs);
    if ("error" in result) {
      errors.push(`${normalized}: ${result.error}`);
      return;
    }
    const { response, finalUrl } = result;
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const type = classifyResource(finalUrl, contentType);
    const isText = ["HTML", "CSS", "JS", "JSON", "XML"].includes(type);
    const maxBytes = isText
      ? HARD_LIMITS.maxTextResponseBytes
      : HARD_LIMITS.maxBinaryResourceBytes;

    let content: string | undefined;
    let size = 0;
    try {
      const buffer = await response.arrayBuffer();
      size = buffer.byteLength;
      if (size > maxBytes) {
        errors.push(`${finalUrl}: resource exceeds size limit (${size} bytes)`);
        resources.push({
          id: nextId(),
          url: finalUrl,
          type,
          contentType,
          status: response.status,
          size,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }
      if (isText) {
        content = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      }
    } catch (err) {
      errors.push(`${finalUrl}: failed to read response (${(err as Error).message})`);
      return;
    }

    resources.push({
      id: nextId(),
      url: finalUrl,
      type,
      contentType,
      status: response.status,
      size,
      content,
      isCompiledBundle: type === "JS" ? isCompiledBundle(finalUrl, content ?? "") : undefined,
      fetchedAt: new Date().toISOString(),
    });
  }

  while (queue.length > 0 && pages.length < options.maxPages) {
    const { url, depth } = queue.shift()!;
    const normalized = normalizeUrl(url);
    if (visitedPages.has(normalized)) continue;
    if (depth > options.maxDepth) continue;
    if (options.sameOriginOnly && !isSameOrigin(normalized, targetUrl)) continue;

    let pathForRobots = "/";
    try {
      pathForRobots = new URL(normalized).pathname;
    } catch {
      // ignore
    }
    if (options.respectRobots && isDisallowedByRobots(pathForRobots, robots)) {
      continue;
    }

    visitedPages.add(normalized);

    if (pages.length >= HARD_LIMITS.maxPages) {
      if (!limitsReached.includes("maxPages")) limitsReached.push("maxPages");
      break;
    }

    const result = await safeFetch(normalized, options.timeoutMs);
    if ("error" in result) {
      errors.push(`${normalized}: ${result.error}`);
      pages.push({
        url: normalized,
        path: pathForRobots,
        depth,
        status: 0,
        size: 0,
        title: "",
      });
      continue;
    }

    const { response, finalUrl } = result;
    const contentType = response.headers.get("content-type") ?? "";
    let html = "";
    let size = 0;
    try {
      const buffer = await response.arrayBuffer();
      size = buffer.byteLength;
      if (size <= HARD_LIMITS.maxTextResponseBytes) {
        html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      } else {
        errors.push(`${finalUrl}: page exceeds size limit (${size} bytes)`);
      }
    } catch (err) {
      errors.push(`${finalUrl}: failed to read page (${(err as Error).message})`);
    }

    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
    pages.push({
      url: finalUrl,
      path: pathForRobots,
      depth,
      status: response.status,
      size,
      title,
    });

    resources.push({
      id: nextId(),
      url: finalUrl,
      type: "HTML",
      contentType: contentType || "text/html",
      status: response.status,
      size,
      content: html,
      fetchedAt: new Date().toISOString(),
    });
    visitedResources.add(normalizeUrl(finalUrl));

    if (depth === 0) {
      const extracted = extractMetadata(html);
      metadata = { ...metadata, ...extracted };
    }

    if (html && response.status < 400) {
      const resourceRefs = extractResourceRefs(html, finalUrl);
      for (const ref of resourceRefs) {
        if (resources.length >= HARD_LIMITS.maxResources) break;
        await recordResource(ref);
      }

      if (depth < options.maxDepth) {
        const links = extractLinks(html, finalUrl);
        for (const link of links) {
          const normalizedLink = normalizeUrl(link);
          if (
            !visitedPages.has(normalizedLink) &&
            (!options.sameOriginOnly || isSameOrigin(normalizedLink, targetUrl))
          ) {
            queue.push({ url: normalizedLink, depth: depth + 1 });
          }
        }
      }
    }
  }

  if (queue.length > 0 && pages.length >= options.maxPages) {
    limitsReached.push("maxPages");
  }

  const stats = resources.reduce(
    (acc, r) => {
      acc.totalSizeBytes += r.size;
      acc.files += 1;
      switch (r.type) {
        case "HTML":
          acc.html += 1;
          break;
        case "CSS":
          acc.css += 1;
          break;
        case "JS":
          acc.javascript += 1;
          break;
        case "JSON":
          acc.json += 1;
          break;
        case "IMAGE":
          acc.images += 1;
          break;
        case "FONT":
          acc.fonts += 1;
          break;
        case "XML":
          acc.xml += 1;
          break;
        default:
          acc.other += 1;
      }
      return acc;
    },
    {
      pages: pages.length,
      files: 0,
      totalSizeBytes: 0,
      html: 0,
      css: 0,
      javascript: 0,
      json: 0,
      images: 0,
      fonts: 0,
      xml: 0,
      other: 0,
      inspectionTimeMs: 0,
    }
  );
  stats.pages = pages.length;
  stats.inspectionTimeMs = Date.now() - startTime;

  return {
    target: targetUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    options,
    stats,
    metadata,
    pages,
    resources,
    errors,
    limitsReached,
  };
}
