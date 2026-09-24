import { ServiceError } from "../errors";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "../request-guards";
import { consentRateIdentity, hasValidConsent } from "../server-state";
import { questionQuotaStore } from "../question-quota";

export function questionEntryHandler(getStore = questionQuotaStore) {
  return async (request: Request): Promise<Response> => {
    try {
      assertSameOrigin(request);
      assertContentLength(request, 2048);
      if (!hasValidConsent(request)) throw new ServiceError("请先完成监护人告知与同意", 403, "CONSENT_REQUIRED");
      assertRateLimit(request, 40, `question-entry:${consentRateIdentity(request)}`);
      const text = await request.text();
      if (text.length > 2048) throw new ServiceError("发题信息过大", 413, "INVALID_REQUEST");
      let body: Record<string, unknown>;
      try { body = JSON.parse(text) as Record<string, unknown>; }
      catch { throw new ServiceError("发题信息不完整，请重试。", 400, "INVALID_REQUEST"); }
      if (!body || typeof body.deviceId !== "string" || typeof body.entryId !== "string" || typeof body.inputHash !== "string") throw new ServiceError("发题信息不完整，请重试。", 400, "INVALID_REQUEST");
      const result = await getStore().admit(body.deviceId, body.entryId, body.inputHash);
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const known = error instanceof ServiceError ? error : null;
      return Response.json({ error: { code: known?.code ?? "QUESTION_QUOTA_UNAVAILABLE", message: known?.message ?? "暂时无法核对今日解题次数，请稍后重试。已打开的题目不受影响。" } },
        { status: known?.status ?? 503, headers: { "Cache-Control": "no-store" } });
    }
  };
}
export const postQuestionAdmission = questionEntryHandler();
