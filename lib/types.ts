export type ResourceType =
  | "HTML"
  | "CSS"
  | "JS"
  | "JSON"
  | "IMAGE"
  | "FONT"
  | "XML"
  | "OTHER";

export interface InspectedResource {
  id: string;
  url: string;
  type: ResourceType;
  contentType: string;
  status: number;
  size: number;
  /** Present for text-like resources (HTML/CSS/JS/JSON/XML). */
  content?: string;
  /** True when a JS resource is a compiled/bundled artifact rather than original source. */
  isCompiledBundle?: boolean;
  fetchedAt: string;
}

export interface InspectedPage {
  url: string;
  path: string;
  depth: number;
  status: number;
  size: number;
  title: string;
}

export interface SiteMetadata {
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  canonical: string | null;
  robots: string | null;
  sitemap: string | null;
}

export interface InspectionStats {
  pages: number;
  files: number;
  totalSizeBytes: number;
  html: number;
  css: number;
  javascript: number;
  json: number;
  images: number;
  fonts: number;
  xml: number;
  other: number;
  inspectionTimeMs: number;
}

export interface InspectionOptions {
  maxPages: number;
  maxDepth: number;
  timeoutMs: number;
  sameOriginOnly: boolean;
  respectRobots: boolean;
}

export interface InspectionReport {
  target: string;
  startedAt: string;
  finishedAt: string;
  options: InspectionOptions;
  stats: InspectionStats;
  metadata: SiteMetadata;
  pages: InspectedPage[];
  resources: InspectedResource[];
  errors: string[];
  limitsReached: string[];
}

export const DEFAULT_INSPECTION_OPTIONS: InspectionOptions = {
  maxPages: 10,
  maxDepth: 2,
  timeoutMs: 8000,
  sameOriginOnly: true,
  respectRobots: true,
};

export const HARD_LIMITS = {
  maxPages: 30,
  maxResources: 300,
  maxTextResponseBytes: 2 * 1024 * 1024, // 2 MB for HTML/JS/CSS/JSON/XML
  maxBinaryResourceBytes: 5 * 1024 * 1024, // 5 MB for images/fonts/other
  maxRedirects: 5,
};
