"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postVerify = postVerify;
const api_1 = require("../api");
const graph_1 = require("../graph");
const providers_1 = require("../providers");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
async function postVerify(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertRateLimit)(request);
        (0, request_guards_1.assertContentLength)(request, 200_000);
        const body = await request.json();
        let session = (0, server_state_1.openSession)(body.stateToken);
        const adapter = (0, providers_1.getProviderAdapter)(session.provider);
        const now = new Date().toISOString();
        if (body.nodeId === "__transfer__")
            return await verifyTransfer(body, session, adapter, now);
        const nodeId = body.nodeId;
        if (typeof nodeId !== "string" || nodeId !== session.currentNodeId)
            throw new Error("只能验收当前学习节点");
        const node = session.nodes.find((item) => item.id === nodeId);
        if (!node)
            throw new Error("知识点不存在");
        if (node.kind === "problem") {
            if (session.stage !== "original_check" || !(0, graph_1.isReadyForOriginal)(session))
                throw new Error("前置知识尚未完成，不能验收原题");
            if (body.source === "parent")
                throw new Error("原题必须由孩子独立完成，不能由家长代为确认");
        }
        else if (session.stage !== "learning" && session.stage !== "diagnosing")
            throw new Error("当前阶段不能验收知识点");
        else if (!(0, graph_1.canVerifyNode)(session, node.id))
            throw new Error("请先完成更简单的前置知识");
        let passed = false;
        let explanation = "";
        let source = "system";
        const explicitlyUnknown = body.action === "mark_unknown";
        if (body.source === "parent") {
            if (node.kind === "problem" || node.state === "needs_help")
                throw new Error("当前节点不能由家长覆盖确认");
            passed = true;
            source = "parent";
            explanation = "已按家长判断记录；最终仍需通过原题和迁移题。";
        }
        else if (explicitlyUnknown)
            explanation = node.atomic ? "先换一种讲法和更具体的例子，再检查一次。" : "已记录为不会，可以继续向下拆解。";
        else {
            if (typeof body.answer !== "string" || !body.answer.trim())
                throw new Error("请先提交孩子的答案");
            ({ passed, explanation } = await adapter.verifyAnswer(node.check, body.answer));
        }
        const attempts = node.attempts + (source === "system" ? 1 : 0);
        const nextState = passed ? (source === "parent" ? "parent_confirmed" : "mastered") : node.atomic && !explicitlyUnknown && attempts >= 2 ? "needs_help" : "unknown";
        session = { ...session, nodes: session.nodes.map((item) => item.id === node.id ? { ...item, attempts, state: nextState } : item), evidence: session.evidence.concat({ nodeId, source, answer: source === "system" && !explicitlyUnknown ? body.answer : undefined, passed, createdAt: now }), updatedAt: now };
        if (node.kind === "problem")
            session = { ...session, originalPassed: passed, stage: passed ? "transfer_check" : "original_check", currentNodeId: passed ? null : node.id };
        else if (nextState === "needs_help")
            session = { ...session, stage: "needs_help", currentNodeId: node.id };
        else if (passed)
            session = (0, api_1.advanceAfterMastery)(session, session.edges.find((edge) => edge.from === node.id)?.to);
        else
            session = { ...session, stage: "learning", currentNodeId: node.id };
        return (0, api_1.ok)(session.provider, adapter.modelId, { ...(0, server_state_1.toClientState)(session), assessment: { passed, explanation, state: nextState } });
    }
    catch (error) {
        return (0, api_1.fail)(error);
    }
}
async function verifyTransfer(body, session, adapter, now) {
    if (session.stage !== "transfer_check" || !session.originalPassed || !session.transferCheck || typeof body.answer !== "string" || !body.answer.trim())
        throw new Error("迁移验收状态不合法");
    const result = await adapter.verifyAnswer(session.transferCheck, body.answer);
    const next = { ...session, transferPassed: result.passed, stage: result.passed ? "complete" : "transfer_check", evidence: session.evidence.concat({ nodeId: "__transfer__", source: "system", answer: body.answer, passed: result.passed, createdAt: now }), updatedAt: now };
    return (0, api_1.ok)(next.provider, adapter.modelId, { ...(0, server_state_1.toClientState)(next), assessment: result });
}
