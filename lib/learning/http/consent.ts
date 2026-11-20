import { assertRateLimit, assertSameOrigin, isNotebookRequest } from "../request-guards";
import { getIllustrationAvailability, listProviderAvailability, listReasoningAvailability } from "../providers/config";
import { CONSENT_COOKIE, createConsentValue, notebookConsent } from "../server-state";

export async function postConsent(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertRateLimit(request, 60);
    const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store, no-transform" });
    const direct = new URL(request.url).searchParams.get("client") === "notebook";
    if (direct && !isNotebookRequest(request)) throw new Error("请求来源不合法");
    if (!direct) headers.append("Set-Cookie", `${CONSENT_COOKIE}=${createConsentValue()}; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`);
    return new Response(JSON.stringify({ accepted: true, ...(direct ? { notebookSession: notebookConsent(request) } : {}), statisticsEnabled: Boolean(process.env.CLOUDBASE_ENV_ID?.trim() && process.env.CLOUDBASE_APIKEY?.trim()), version: "guardian-v1", providers: listProviderAvailability(), reasoningLevels: listReasoningAvailability(), illustration: getIllustrationAvailability() }), { headers });
  } catch (error) {
    return Response.json({ accepted: false, message: error instanceof Error ? error.message : "无法记录监护人同意" }, { status: 400 });
  }
}
