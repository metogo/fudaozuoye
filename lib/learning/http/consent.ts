import { assertRateLimit, assertSameOrigin } from "../request-guards";
import { getIllustrationAvailability, listProviderAvailability, listReasoningAvailability } from "../providers/config";
import { CONSENT_COOKIE, createConsentValue } from "../server-state";

export async function postConsent(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertRateLimit(request, 60);
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", `${CONSENT_COOKIE}=${createConsentValue()}; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return new Response(JSON.stringify({ accepted: true, version: "guardian-v1", providers: listProviderAvailability(), reasoningLevels: listReasoningAvailability(), illustration: getIllustrationAvailability() }), { headers });
  } catch (error) {
    return Response.json({ accepted: false, message: error instanceof Error ? error.message : "无法记录监护人同意" }, { status: 400 });
  }
}
