"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postAnalyze = postAnalyze;
const curriculum_1 = require("../curriculum");
const providers_1 = require("../providers");
const mock_engine_1 = require("../mock-engine");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const types_1 = require("../types");
const sse_1 = require("./sse");
const subjects = new Set(types_1.subjects);
const bands = new Set(["primary", "junior", "senior"]);
const reasoningLevels = new Set(["light", "medium", "high"]);
async function postAnalyze(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertContentLength)(request, 7 * 1024 * 1024);
        if (!(0, server_state_1.hasValidConsent)(request))
            return new Response("请先完成监护人告知与同意", { status: 403 });
        (0, request_guards_1.assertRateLimit)(request, 30, (0, server_state_1.consentRateIdentity)(request) ?? undefined);
        const form = await request.formData();
        const requestedProvider = form.get("provider");
        const requestedReasoningLevel = form.get("reasoningLevel");
        const stage = form.get("stage");
        if (!(0, providers_1.isProviderId)(requestedProvider) || !reasoningLevels.has(requestedReasoningLevel) || (stage !== "recognize" && stage !== "recognize_text" && stage !== "full"))
            return new Response("推理强度或分析阶段不合法", { status: 400 });
        const reasoningLevel = requestedReasoningLevel;
        const provider = "doubao";
        const adapter = (0, providers_1.getProviderAdapter)(provider, reasoningLevel, request.signal);
        if (stage === "recognize")
            return recognize(form, provider, adapter);
        if (stage === "recognize_text")
            return recognizeText(form, provider, adapter);
        const raw = form.get("problem");
        if (typeof raw !== "string" || raw.length > 24_000)
            return new Response("缺少已确认的题目", { status: 400 });
        const problem = parseProblemSnapshot(JSON.parse(raw));
        if (adapter.mode === "demo" && !(0, mock_engine_1.isBuiltInMockProblem)(problem))
            return new Response("演示模式只支持内置代表题，请返回重新识别题目", { status: 400 });
        return (0, sse_1.sse)(async (send) => {
            const startedAt = Date.now();
            send("phase", { key: "mapping", label: "正在理解题目要解决什么" });
            const session = await adapter.prepareChatSession(problem, (key, label) => send("phase", { key, label }));
            send("perf.phase", { key: "session_ready", elapsedMs: Date.now() - startedAt });
            send("graph", (0, server_state_1.toClientState)(session));
            send("complete", { provider, modelId: adapter.modelId, mode: adapter.mode });
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "分析请求失败";
        return new Response(message, { status: message.includes("过大") ? 413 : message.includes("频繁") ? 429 : 400 });
    }
}
function recognizeText(form, provider, adapter) {
    const raw = form.get("text");
    if (typeof raw !== "string" || raw.trim().length < 3 || raw.length > 8_000)
        return new Response("请输入一道完整的题目", { status: 400 });
    return (0, sse_1.sse)(async (send) => {
        const startedAt = Date.now();
        send("phase", { key: "recognizing", label: "正在读懂你发来的题目" });
        send("recognized", await adapter.recognizeTextProblem(raw.trim()));
        send("perf.phase", { key: "text_recognized", elapsedMs: Date.now() - startedAt });
        send("complete", { provider, modelId: adapter.modelId, mode: adapter.mode });
    });
}
async function recognize(form, provider, adapter) {
    const file = form.get("image");
    if (!(file instanceof File))
        return new Response("请先选择一道题的照片", { status: 400 });
    await (0, request_guards_1.assertImageFile)(file);
    return (0, sse_1.sse)(async (send) => {
        const startedAt = Date.now();
        send("phase", { key: "recognizing", label: "正在识别题干与你的作答" });
        const imageDataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
        send("recognized", await adapter.recognizeProblem(imageDataUrl));
        send("perf.phase", { key: "image_recognized", elapsedMs: Date.now() - startedAt });
        send("complete", { provider, modelId: adapter.modelId, mode: adapter.mode });
    });
}
function parseProblemSnapshot(value) {
    if (!value || typeof value !== "object")
        throw new Error("题目确认信息不完整");
    const item = value;
    if (typeof item.text !== "string" || item.text.trim().length < 3 || item.text.length > 8_000 || typeof item.childWork !== "string" || item.childWork.length > 8_000 || !subjects.has(item.subject) || !bands.has(item.gradeBand) || !(0, curriculum_1.isSupportedSubjectBand)(item.subject, item.gradeBand))
        throw new Error("题目确认信息不合法");
    const gradeBand = item.gradeBand;
    return { text: item.text.trim(), childWork: item.childWork.trim(), subject: item.subject, gradeBand, learnerBand: gradeBand, confidence: typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : 0, userRevised: item.userRevised === true };
}
