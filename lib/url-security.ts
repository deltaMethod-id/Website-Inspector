import dns from "node:dns/promises";
import net from "node:net";

/**
 * WIPAS / Website Inspector — URL & SSRF protection.
 *
 * The crawler is only ever allowed to reach resources that a normal
 * browser could load publicly. This module blocks localhost, private
 * network ranges, link-local metadata endpoints, and internal-only
 * hostnames — both for the initial request and for every redirect hop.
 */

const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost"];

const BLOCKED_EXACT_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
]);

/** CIDR ranges that must never be contacted by the crawler. */
const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ["127.0.0.0", 8], // loopback
  ["10.0.0.0", 8], // RFC1918
  ["172.16.0.0", 12], // RFC1918
  ["192.168.0.0", 16], // RFC1918
  ["169.254.0.0", 16], // link-local incl. cloud metadata (169.254.169.254)
  ["0.0.0.0", 8], // "this" network
  ["100.64.0.0", 10], // CGNAT
  ["192.0.0.0", 24], // IETF protocol assignments
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

function ipToInt(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isIpv4InRange(ip: string, base: string, prefix: number): boolean {
  if (!net.isIPv4(ip)) return false;
  const ipInt = ipToInt(ip);
  const baseInt = ipToInt(base);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isBlockedIpv4(ip: string): boolean {
  return BLOCKED_IPV4_RANGES.some(([base, prefix]) =>
    isIpv4InRange(ip, base, prefix)
  );
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower === "::") return true; // unspecified
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — check the embedded IPv4 address too.
    const embedded = lower.replace("::ffff:", "");
    if (net.isIPv4(embedded)) return isBlockedIpv4(embedded);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true; // unknown format — fail closed
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_EXACT_HOSTNAMES.has(host)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  // A bare IP literal used as a hostname.
  if (net.isIP(host)) return isBlockedIp(host);
  return false;
}

export interface UrlSafetyResult {
  safe: boolean;
  reason?: string;
  resolvedIp?: string;
}

/**
 * Validates a URL is well-formed, uses http/https, has a non-blocked
 * hostname, and resolves via DNS to a non-blocked IP address. Must be
 * called again for every redirect hop — never trust a single check to
 * cover a chain of redirects.
 */
export async function validateUrlSafety(
  rawUrl: string
): Promise<UrlSafetyResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { safe: false, reason: `Unsupported protocol: ${url.protocol}` };
  }

  if (isBlockedHostname(url.hostname)) {
    return { safe: false, reason: `Blocked hostname: ${url.hostname}` };
  }

  try {
    const records = await dns.lookup(url.hostname, { all: true });
    if (records.length === 0) {
      return { safe: false, reason: "DNS resolution returned no records" };
    }
    for (const record of records) {
      if (isBlockedIp(record.address)) {
        return {
          safe: false,
          reason: `Hostname resolves to a blocked IP range: ${record.address}`,
          resolvedIp: record.address,
        };
      }
    }
    return { safe: true, resolvedIp: records[0].address };
  } catch (err) {
    return { safe: false, reason: "DNS resolution failed" };
  }
}

export function isSameOrigin(a: string, b: string): boolean {
  try {
    const urlA = new URL(a);
    const urlB = new URL(b);
    return urlA.origin === urlB.origin;
  } catch {
    return false;
  }
}

/** Strips fragments and normalizes trailing slashes for dedup purposes. */
export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}
