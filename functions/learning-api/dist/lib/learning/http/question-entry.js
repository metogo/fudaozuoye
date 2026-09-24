"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postQuestionAdmission = void 0;
exports.questionEntryHandler = questionEntryHandler;
const errors_1 = require("../errors");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const question_quota_1 = require("../question-quota");
function questionEntryHandler(getStore = question_quota_1.questionQuotaStore) {
    return async (request) => {
        try {
            (0, request_guards_1.assertSameOrigin)(request);
            (0, request_guards_1.assertContentLength)(request, 2048);
            if (!(0, server_state_1.hasValidConsent)(request))
                throw new errors_1.ServiceError("请先完成监护人告知与同意", 403, "CONSENT_REQUIRED");
            (0, request_guards_1.assertRateLimit)(request, 40, `question-entry:${(0, server_state_1.consentRateIdentity)(request)}`);
            const text = await request.text();
            if (text.length > 2048)
                throw new errors_1.ServiceError("发题信息过大", 413, "INVALID_REQUEST");
            let body;
            try {
                body = JSON.parse(text);
            }
            catch {
                throw new errors_1.ServiceError("发题信息不完整，请重试。", 400, "INVALID_REQUEST");
            }
            if (!body || typeof body.deviceId !== "string" || typeof body.entryId !== "string" || typeof body.inputHash !== "string")
                throw new errors_1.ServiceError("发题信息不完整，请重试。", 400, "INVALID_REQUEST");
            const result = await getStore().admit(body.deviceId, body.entryId, body.inputHash);
            return Response.json(result, { headers: { "Cache-Control": "no-store" } });
        }
        catch (error) {
            const known = error instanceof errors_1.ServiceError ? error : null;
            return Response.json({ error: { code: known?.code ?? "QUESTION_QUOTA_UNAVAILABLE", message: known?.message ?? "暂时无法核对今日解题次数，请稍后重试。已打开的题目不受影响。" } }, { status: known?.status ?? 503, headers: { "Cache-Control": "no-store" } });
        }
    };
}
exports.postQuestionAdmission = questionEntryHandler();
