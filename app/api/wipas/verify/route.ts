import { NextRequest, NextResponse } from "next/server";
import {
  WIPAS_COOKIE_NAME,
  WIPAS_SESSION_TTL_SECONDS,
  checkInspectorPassword,
  createWipasSessionToken,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  let password: string;
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!password) {
    return NextResponse.json(
      { ok: false, message: "WIPAS password is required." },
      { status: 400 }
    );
  }

  let isValid: boolean;
  try {
    isValid = checkInspectorPassword(password);
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: (err as Error).message },
      { status: 500 }
    );
  }

  if (!isValid) {
    return NextResponse.json(
      { ok: false, message: "WIPAS verification failed. Incorrect password." },
      { status: 401 }
    );
  }

  const token = await createWipasSessionToken();
  const response = NextResponse.json({ ok: true, message: "WIPAS verified." });
  response.cookies.set({
    name: WIPAS_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: WIPAS_SESSION_TTL_SECONDS,
  });
  return response;
}
