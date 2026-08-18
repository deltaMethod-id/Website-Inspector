import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { WIPAS_COOKIE_NAME, verifyWipasSessionToken } from "@/lib/auth";
import { inspectWebsite } from "@/lib/crawler";
import { DEFAULT_INSPECTION_OPTIONS } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const token = cookies().get(WIPAS_COOKIE_NAME)?.value;
  const authorized = await verifyWipasSessionToken(token);
  if (!authorized) {
    return NextResponse.json(
      { ok: false, message: "WIPAS verification required." },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const target = typeof body.target === "string" ? body.target.trim() : "";
  if (!target) {
    return NextResponse.json({ ok: false, message: "Target URL is required." }, { status: 400 });
  }

  let normalizedTarget = target;
  if (!/^https?:\/\//i.test(normalizedTarget)) {
    normalizedTarget = `https://${normalizedTarget}`;
  }

  try {
    // Validate parse-ability up front for a clean error message.
    // eslint-disable-next-line no-new
    new URL(normalizedTarget);
  } catch {
    return NextResponse.json({ ok: false, message: "Target is not a valid URL." }, { status: 400 });
  }

  const options = {
    maxPages: Number(body.maxPages) || DEFAULT_INSPECTION_OPTIONS.maxPages,
    maxDepth: Number(body.maxDepth) || DEFAULT_INSPECTION_OPTIONS.maxDepth,
    timeoutMs: Number(body.timeoutMs) || DEFAULT_INSPECTION_OPTIONS.timeoutMs,
    sameOriginOnly:
      typeof body.sameOriginOnly === "boolean"
        ? body.sameOriginOnly
        : DEFAULT_INSPECTION_OPTIONS.sameOriginOnly,
    respectRobots:
      typeof body.respectRobots === "boolean"
        ? body.respectRobots
        : DEFAULT_INSPECTION_OPTIONS.respectRobots,
  };

  try {
    const report = await inspectWebsite(normalizedTarget, options);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: (err as Error).message || "Inspection failed." },
      { status: 422 }
    );
  }
}
