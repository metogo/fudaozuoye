"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postAnalyze = postAnalyze;
const curriculum_1 = require("../curriculum");
const providers_1 = require("../providers");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const sse_1 = require("./sse");
const subjects = new Set(["math", "physics", "chemistry"]);
const bands = new Set(["primary", "junior", "senior"]);
async function postAnalyze(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertContentLength)(request, 7 * 1024 * 1024);
        if (!(0, server_state_1.hasValidConsent)(request))
            return new Response("请先完成监护人告知与同意", { status: 403 });
        (0, request_guards_1.assertRateLimit)(request, 30, (0, server_state_1.consentRateIdentity)(request) ?? undefined);
        const form = await request.formData();
        const requestedProvider = form.get("provider");
        const stage = form.get("stage");
        if (!(0, providers_1.isProviderId)(requestedProvider) || (stage !== "recognize" && stage !== "full"))
            return new Response("模型或分析阶段不合法", { status: 400 });
        const provider = "doubao";
        const adapter = (0, providers_1.getProviderAdapter)(provider);
        if (stage === "recognize")
            return recognize(form, provider, adapter);
        const raw = form.get("problem");
        if (typeof raw !== "string" || raw.length > 24_000)
            return new Response("缺少已确认的题目", { status: 400 });
        const problem = parseProblemSnapshot(JSON.parse(raw));
        return (0, sse_1.sse)(async (send) => {
            send("phase", { key: "mapping", label: "正在生成直接前置知识路径" });
            const session = await adapter.analyzeProblem(problem, (key, label) => send("phase", { key, label }));
            send("graph", (0, server_state_1.toClientState)(session));
            send("complete", { provider, modelId: adapter.modelId, mode: adapter.mode });
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "分析请求失败";
        return new Response(message, { status: message.includes("过大") ? 413 : message.includes("频繁") ? 429 : 400 });
    }
}
async function recognize(form, provider, adapter) {
    const file = form.get("image");
    if (!(file instanceof File))
        return new Response("请先选择一道题的照片", { status: 400 });
    await (0, request_guards_1.assertImageFile)(file);
    return (0, sse_1.sse)(async (send) => {
        send("phase", { key: "recognizing", label: "正在识别题干与孩子作答" });
        const imageDataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
        send("recognized", await adapter.recognizeProblem(imageDataUrl));
        send("complete", { provider, modelId: adapter.modelId, mode: adapter.mode });
    });
}
function parseProblemSnapshot(value) {
    if (!value || typeof value !== "object")
        throw new Error("题目确认信息不完整");
    const item = value;
    if (typeof item.text !== "string" || item.text.trim().length < 3 || item.text.length > 8_000 || typeof item.childWork !== "string" || item.childWork.length > 8_000 || !subjects.has(item.subject) || !bands.has(item.gradeBand) || !(0, curriculum_1.isSupportedSubjectBand)(item.subject, item.gradeBand))
        throw new Error("题目确认信息不合法");
    return { text: item.text.trim(), childWork: item.childWork.trim(), subject: item.subject, gradeBand: item.gradeBand, confidence: typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : 0, userRevised: item.userRevised === true };
}
