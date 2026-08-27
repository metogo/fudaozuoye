"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSession = parseSession;
exports.requestId = requestId;
exports.ok = ok;
exports.fail = fail;
exports.advanceAfterMastery = advanceAfterMastery;
const graph_1 = require("./graph");
const errors_1 = require("./errors");
function parseSession(value) {
    if (!value || typeof value !== "object")
        throw new Error("学习会话不存在");
    const session = value;
    if (session.schemaVersion !== "1.0" || !Array.isArray(session.nodes) || !Array.isArray(session.edges) || !session.problem) {
        throw new Error("学习会话结构不合法");
    }
    if (typeof session.rootNodeId !== "string" || !session.nodes.some((node) => node.id === session.rootNodeId)) {
        throw new Error("学习会话缺少原题节点");
    }
    if (session.nodes.length > 64 || session.edges.length > 128 || !Array.isArray(session.evidence) || session.evidence.length > 256)
        throw new Error("学习会话数据量不合法");
    if (typeof session.currentNodeId !== "string" && session.currentNodeId !== null)
        throw new Error("当前知识点不合法");
    if (session.currentNodeId && !session.nodes.some((node) => node.id === session.currentNodeId))
        throw new Error("当前知识点不存在");
    for (const node of session.nodes) {
        if (!node || typeof node !== "object" || typeof node.id !== "string" || typeof node.conceptId !== "string" || typeof node.title !== "string" || !Number.isInteger(node.difficulty) || !Number.isInteger(node.attempts) || node.attempts < 0 || node.attempts > 20)
            throw new Error("知识节点结构不合法");
        if (!node.check || typeof node.check.prompt !== "string" || typeof node.check.answer !== "string" || !node.teaching || typeof node.teaching.explanation !== "string")
            throw new Error("知识节点教学内容不合法");
    }
    (0, graph_1.assertGraphInvariants)(session);
    return session;
}
function requestId() {
    return `req-${crypto.randomUUID().slice(0, 8)}`;
}
function ok(provider, modelId, data, id = requestId()) {
    const payload = { schemaVersion: "1.0", requestId: id, provider, modelId, data, error: null };
    return Response.json(payload);
}
function fail(error, provider = "doubao", modelId = "unavailable", status = 400) {
    const message = error instanceof Error ? error.message : "请求失败";
    const actualStatus = error instanceof errors_1.ServiceError ? error.status : status;
    const payload = {
        schemaVersion: "1.0", requestId: requestId(), provider, modelId, data: null,
        error: { code: error instanceof errors_1.ServiceError ? error.code : actualStatus >= 500 ? "PROVIDER_ERROR" : "INVALID_REQUEST", message, retryable: error instanceof errors_1.ServiceError ? error.retryable : actualStatus >= 500 },
    };
    return Response.json(payload, { status: actualStatus });
}
function advanceAfterMastery(session, preferredDependentId) {
    if ((0, graph_1.isReadyForOriginal)(session)) {
        return { ...session, currentNodeId: session.rootNodeId, stage: "original_check", updatedAt: new Date().toISOString() };
    }
    const next = (0, graph_1.nextReadyNode)(session, preferredDependentId);
    return { ...session, currentNodeId: next?.id ?? null, stage: "learning", updatedAt: new Date().toISOString() };
}
