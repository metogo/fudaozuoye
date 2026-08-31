"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postSimilarCheck = postSimilarCheck;
const api_1 = require("../api");
const providers_1 = require("../providers");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const sse_1 = require("./sse");
function normalizedPrompt(value) {
    return value.replace(/[\s，。！？；：、“”‘’（）()]/g, "").toLowerCase();
}
async function postSimilarCheck(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertRateLimit)(request);
        (0, request_guards_1.assertContentLength)(request, 200_000);
        const body = await request.json();
        const session = (0, server_state_1.openSession)(body.stateToken);
        if (typeof body.nodeId !== "string" || body.nodeId !== session.currentNodeId)
            throw new Error("只能更换当前知识点的练习题");
        if (session.stage !== "diagnosing" && session.stage !== "learning")
            throw new Error("当前学习阶段不能更换练习题");
        const node = session.nodes.find((item) => item.id === body.nodeId);
        if (!node || node.kind !== "concept" || node.state === "mastered" || node.state === "parent_confirmed" || node.state === "needs_help")
            throw new Error("当前知识点不能更换练习题");
        const adapter = (0, providers_1.getSessionProviderAdapter)(session);
        return (0, sse_1.sse)(async (send) => {
            send("phase", { key: "generating", label: `正在生成“${node.title}”的同知识点新题` });
            const check = await adapter.generateSimilarCheck(session, node.id);
            if (check.conceptId !== node.conceptId || !check.id.startsWith("similar-") || !check.prompt.trim() || !check.answer.trim())
                throw new Error("新练习题没有可靠绑定当前知识点");
            if (normalizedPrompt(check.prompt) === normalizedPrompt(node.check.prompt))
                throw new Error("模型返回了重复题目，请重新换一道");
            const next = {
                ...session,
                nodes: session.nodes.map((item) => item.id === node.id ? { ...item, check } : item),
                updatedAt: new Date().toISOString(),
            };
            send("graph", (0, server_state_1.toClientState)(next));
            send("complete", { provider: session.provider, modelId: adapter.modelId, source: adapter.mode === "live" ? "model_generated" : "fixed_demo" });
        });
    }
    catch (error) {
        return (0, api_1.fail)(error);
    }
}
