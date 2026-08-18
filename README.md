# Website Inspector

**PUBLIC RESOURCE INSPECTION CONSOLE** — a Next.js (App Router, TypeScript,
TSX) tool for inspecting the public resources of a website you own or have
permission to inspect: HTML, CSS, JavaScript, JSON, XML, images, fonts,
favicon, metadata, `robots.txt`, and `sitemap.xml`.

Access to the console is protected by **WIPAS**.

## What is WIPAS?

**WIPAS — Website Inspector Password Authentication System.**

WIPAS is *not* a login/account system. There are no usernames, no
registration, and no "logout" — WIPAS is a single shared password that
gates access to the console:

```
Website Inspector
      ↓
WIPAS Password Gate      (/wipas)
      ↓
Enter Password
      ↓
WIPAS Verification       (/api/wipas/verify)
      ↓
Website Inspector Console (/)
```

- The password is read from the `INSPECTOR_PASSWORD` environment
  variable — it is never hard-coded or stored client-side.
- On success, the server issues a signed, **HTTP-only**, `Secure`
  (in production) session cookie with an **8-hour expiration**.
- The cookie is signed with `SESSION_SECRET` and is never written to
  `localStorage` or `sessionStorage`.
- Pressing **LOCK WIPAS** on the dashboard calls `/api/wipas/lock`,
  which clears the session cookie and returns you to `/wipas`.

## Installation

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```bash
INSPECTOR_PASSWORD=choose-a-strong-password
SESSION_SECRET=$(openssl rand -hex 32)
NEXT_PUBLIC_APP_NAME=Website Inspector
```

## Development

```bash
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/wipas` until you
enter the correct `INSPECTOR_PASSWORD`.

## Production

```bash
npm run build
npm run start
```

## Deploying to Vercel

This project includes a `vercel.json` configured for the Next.js framework
preset. Set `INSPECTOR_PASSWORD`, `SESSION_SECRET`, and
`NEXT_PUBLIC_APP_NAME` as Environment Variables in your Vercel project
settings (do **not** commit `.env.local`). The `inspect` and `export` API
routes are configured with an extended `maxDuration` since crawling and
zipping can take longer than the default timeout.

## How inspection works

1. Enter a target URL (e.g. `https://example.com`) and press
   **INSPECT WEBSITE**.
2. The server-side crawler (`lib/crawler.ts`) fetches the page and any
   linked internal pages, up to your configured limits, collecting:
   - Page HTML
   - Linked CSS, JS, JSON, XML, images, and fonts
   - `<title>`, meta description, Open Graph tags, canonical URL,
     `robots` meta tag
   - `robots.txt` and any declared `sitemap.xml`
3. Results are shown in the dashboard: stats, a filterable resource
   sidebar, a source viewer with syntax highlighting/search/copy/download,
   an image viewer, the page list, and a network/resource summary.
4. Press **DOWNLOAD ZIP** to export everything as a structured archive.

### Compiled bundles, not private source

If a target is built with React, Next.js, Vue, Svelte, or any other
framework, the browser (and this tool) only ever receives **compiled,
bundled JavaScript** — never the original `.tsx`/`.jsx`/`.vue` source,
because that source is not sent by the server in normal operation. Any
JavaScript resource collected by this tool is explicitly labeled
**COMPILED CLIENT BUNDLE**, never "original source," to avoid implying
something it isn't. If a target happens to expose public source maps,
those are treated as ordinary public resources like any other file — the
tool does not attempt to reconstruct anything beyond what the server
actually serves.

## Crawler limits & SSRF protection

**Crawl configuration** (adjustable per-inspection, capped by hard limits):

| Option | Default | Hard cap |
|---|---|---|
| Maximum Pages | 10 | 30 |
| Maximum Crawl Depth | 2 | 5 |
| Request Timeout | 8000 ms | 20000 ms |
| Same-Origin Only | ON | — |
| Respect `robots.txt` | ON | — |

**Resource limits** (fixed, not user-adjustable):

- Maximum resources per inspection: 300
- Maximum HTML/CSS/JS/JSON/XML response size: 2 MB
- Maximum binary (image/font/other) resource size: 5 MB
- Maximum redirects followed per request: 5

**SSRF protection** (`lib/url-security.ts`) — every request, and every
redirect hop, is validated before it is made:

- Blocks `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`
- Blocks private IPv4 ranges: `10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`
- Blocks link-local addresses, including the cloud metadata endpoint
  `169.254.169.254`
- Blocks private/unique-local/link-local IPv6 ranges
- Blocks internal-only hostname suffixes: `.local`, `.internal`,
  `.localhost`
- Resolves DNS before connecting and re-validates the resolved IP —
  hostnames cannot be used to bypass IP-based blocks
- Re-validates on **every** redirect hop, so a redirect chain cannot be
  used to reach a blocked address

## What this tool intentionally does **not** do

Website Inspector only reads resources that are already public and
reachable by an ordinary browser. It does not — and will not — attempt to:

- Bypass authentication, authorization, CAPTCHAs, WAFs, DRM, or rate limits
- Retrieve private/unpublished source code, credentials, or tokens
- Reach internal, private, or link-local network addresses (see SSRF
  protection above)

Use it only against websites you own or have explicit permission to
inspect.

## ZIP export

Pressing **DOWNLOAD ZIP** sends the current inspection report to
`/api/export`, which builds an archive shaped like:

```
inspected-site/
├── pages/
│   ├── index.html
│   ├── about/index.html
│   └── contact/index.html
├── assets/
│   ├── css/
│   ├── js/
│   ├── images/
│   ├── fonts/
│   └── other/
└── metadata/
    ├── site.json
    ├── links.json
    └── report.json
```

All paths written into the archive are sanitized (`lib/zip.ts`) to strip
`../` segments and unsafe characters, preventing zip-slip / path
traversal.

## Project structure

```
Website-Inspector/
├── app/
│   ├── wipas/page.tsx              WIPAS password gate (the only auth page)
│   ├── api/
│   │   ├── wipas/verify/route.ts   Verifies the WIPAS password, sets session cookie
│   │   ├── wipas/lock/route.ts     Clears the session cookie ("LOCK WIPAS")
│   │   ├── inspect/route.ts        Runs the crawler
│   │   └── export/route.ts         Builds and streams the ZIP
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                    Protected dashboard entry
├── components/
│   ├── WipasGate.tsx
│   ├── Dashboard.tsx
│   └── SourceViewer.tsx
├── lib/
│   ├── auth.ts                     WIPAS session signing/verification
│   ├── crawler.ts                  Crawler + resource classification
│   ├── url-security.ts             SSRF protection
│   ├── zip.ts                      Safe ZIP archive builder
│   └── types.ts
├── .env.example
├── next.config.ts
├── package.json
├── tsconfig.json
└── vercel.json
```

## Naming rule

Every access-control concept in this project uses **WIPAS** terminology —
"WIPAS Password Gate," "WIPAS Verification," "LOCK WIPAS" — instead of
login/logout/account language, by design.
