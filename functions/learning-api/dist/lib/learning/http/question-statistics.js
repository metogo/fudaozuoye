"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postQuestionEntry = exports.getQuestionStatistics = void 0;
exports.statisticsHandlers = statisticsHandlers;
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const question_statistics_1 = require("../question-statistics");
const errors_1 = require("../errors");
const headers = { "Cache-Control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function statisticsHandlers(getStore = question_statistics_1.questionStatisticsStore) {
    return {
        async get() {
            try {
                return Response.json({ total: await getStore().total() }, { headers });
            }
            catch (error) {
                return unavailable(error);
            }
        },
        async post(request) {
            try {
                (0, request_guards_1.assertSameOrigin)(request);
            }
            catch {
                return Response.json({ message: "请求来源不合法" }, { status: 403, headers });
            }
            if (!(0, server_state_1.hasValidConsent)(request))
                return Response.json({ message: "请先完成页面初始化" }, { status: 403, headers });
            let submissionId;
            try {
                (0, request_guards_1.assertContentLength)(request, 256);
                (0, request_guards_1.assertRateLimit)(request, 30, `statistics:${(0, server_state_1.consentRateIdentity)(request)}`);
                const body = await request.text();
                if (new TextEncoder().encode(body).length > 256)
                    throw new Error("body too large");
                const data = JSON.parse(body);
                if (!data || typeof data !== "object" || Array.isArray(data))
                    throw new Error("invalid request");
                const item = data;
                if (Object.keys(item).length !== 1 || typeof item.submissionId !== "string" || !uuid.test(item.submissionId))
                    throw new Error("invalid submission id");
                submissionId = item.submissionId.toLowerCase();
            }
            catch (error) {
                const status = error instanceof errors_1.ServiceError ? error.status : 400;
                return Response.json({ message: "统计请求无效或过于频繁" }, { status, headers });
            }
            try {
                return Response.json(await getStore().record(submissionId), { headers });
            }
            catch (error) {
                return unavailable(error);
            }
        },
    };
}
function unavailable(error) {
    // No credentials, question content, or raw SDK errors may reach the browser/logs.
    const reason = error instanceof Error && /^STATISTICS_[A-Z_]{3,80}$/.test(error.message)
        ? error.message : "STATISTICS_DATABASE_OPERATION_FAILED";
    console.error(`[question-statistics] ${reason}`);
    return Response.json({ message: "统计暂不可用" }, { status: 503, headers });
}
const handlers = statisticsHandlers();
exports.getQuestionStatistics = handlers.get;
exports.postQuestionEntry = handlers.post;
