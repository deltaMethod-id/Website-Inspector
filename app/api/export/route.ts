import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { WIPAS_COOKIE_NAME, verifyWipasSessionToken } from "@/lib/auth";
import { buildInspectionZip } from "@/lib/zip";
import { InspectionReport } from "@/lib/types";

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

  let report: InspectionReport;
  try {
    const body = await request.json();
    report = body.report as InspectionReport;
    if (!report || !Array.isArray(report.pages) || !Array.isArray(report.resources)) {
      throw new Error("Malformed report payload.");
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: (err as Error).message || "Invalid report payload." },
      { status: 400 }
    );
  }

  try {
    const zipBytes = await buildInspectionZip(report);
    const host = (() => {
      try {
        return new URL(report.target).hostname.replace(/[^a-zA-Z0-9.-]/g, "_");
      } catch {
        return "inspected-site";
      }
    })();
    return new NextResponse(Buffer.from(zipBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${host}-inspected.zip"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: (err as Error).message || "Export failed." },
      { status: 500 }
    );
  }
}
