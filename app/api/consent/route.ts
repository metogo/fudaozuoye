import { NextResponse } from "next/server";
import { assertRateLimit, assertSameOrigin } from "@/lib/learning/request-guards";
import { CONSENT_COOKIE, createConsentValue } from "@/lib/learning/server-state";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertRateLimit(request, 60);
    const response = NextResponse.json({ accepted: true, version: "guardian-v1" });
    response.cookies.set(CONSENT_COOKIE, createConsentValue(), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ accepted: false, message: error instanceof Error ? error.message : "无法记录监护人同意" }, { status: 400 });
  }
}
