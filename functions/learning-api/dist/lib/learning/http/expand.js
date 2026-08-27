"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postExpand = postExpand;
const api_1 = require("../api");
const graph_1 = require("../graph");
const providers_1 = require("../providers");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const sse_1 = require("./sse");
async function postExpand(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertRateLimit)(request);
        (0, request_guards_1.assertContentLength)(request, 200_000);
        const body = await request.json();
        const session = (0, server_state_1.openSession)(body.stateToken);
        if (typeof body.targetNodeId !== "string" || body.targetNodeId !== session.currentNodeId)
            throw new Error("只能拆解当前学习节点");
        const adapter = (0, providers_1.getProviderAdapter)(session.provider);
        return (0, sse_1.sse)(async (send) => {
            send("phase", { key: "locating", label: "正在检查这个知识点还缺哪些更简单的前置" });
            const expansion = await adapter.expandNode(session, body.targetNodeId, (key, label) => send("phase", { key, label }));
            send("graph", (0, server_state_1.toClientState)((0, graph_1.mergeExpansion)(session, body.targetNodeId, expansion.nodes, expansion.edges)));
            send("complete", { provider: session.provider, modelId: adapter.modelId, mode: adapter.mode });
        });
    }
    catch (error) {
        return (0, api_1.fail)(error);
    }
}
