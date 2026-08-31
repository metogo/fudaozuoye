"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postTutor = postTutor;
const providers_1 = require("../providers");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const sse_1 = require("./sse");
async function postTutor(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertRateLimit)(request, 30);
        (0, request_guards_1.assertContentLength)(request, 210_000);
        const body = await request.json();
        const session = (0, server_state_1.openSession)(body.stateToken);
        const question = parseQuestion(body.question);
        const scope = parseScope(body.scope, session.nodes.map((node) => ({ id: node.id, kind: node.kind })));
        const adapter = (0, providers_1.getSessionProviderAdapter)(session);
        return (0, sse_1.sse)(async (send) => {
            send("meta", { schemaVersion: "1.0", provider: session.provider, modelId: adapter.modelId, requestId: session.requestId, scope });
            await adapter.streamTutorReply(session, scope, question, (delta) => send("delta", { text: delta }), request.signal);
            send("complete", { provider: session.provider, modelId: adapter.modelId });
        });
    }
    catch (error) {
        return Response.json({
            schemaVersion: "1.0",
            data: null,
            error: { code: "INVALID_REQUEST", message: error instanceof Error ? error.message : "追问失败", retryable: false },
        }, { status: 400 });
    }
}
function parseQuestion(value) {
    if (typeof value !== "string")
        throw new Error("请输入想问的问题");
    const question = value.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if (!question)
        throw new Error("请输入想问的问题");
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(question))
        throw new Error("问题中含有不支持的控制字符");
    if (question.length > 300)
        throw new Error("问题请控制在 300 字以内");
    return question;
}
function parseScope(value, nodes) {
    if (!value || typeof value !== "object")
        throw new Error("追问范围不合法");
    const scope = value;
    if (scope.kind === "problem") {
        if (scope.section === undefined)
            return { kind: "problem" };
        if (!isProblemGuideSection(scope.section))
            throw new Error("追问的原题段落不存在");
        return { kind: "problem", section: scope.section };
    }
    if (scope.kind !== "node" || typeof scope.nodeId !== "string")
        throw new Error("追问范围不合法");
    if (!nodes.some((node) => node.id === scope.nodeId && node.kind === "concept"))
        throw new Error("追问的知识节点不存在");
    return { kind: "node", nodeId: scope.nodeId };
}
function isProblemGuideSection(value) {
    return value === "goal" || value === "keyClue" || value === "approach";
}
