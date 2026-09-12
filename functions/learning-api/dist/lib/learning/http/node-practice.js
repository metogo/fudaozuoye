"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postNodePractice = postNodePractice;
const api_1 = require("../api");
const providers_1 = require("../providers");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const knowledge_map_1 = require("../knowledge-map");
const node_practice_1 = require("../node-practice");
/** Optional, read-only practice: never changes the original lesson or counters. */
async function postNodePractice(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertContentLength)(request, 200000);
        (0, request_guards_1.assertRateLimit)(request, 8, `node-practice:${(0, server_state_1.consentRateIdentity)(request) ?? request.headers.get("x-real-ip") ?? "local"}`);
        const body = await request.json();
        const session = (0, server_state_1.openSession)(body.stateToken);
        const map = (0, knowledge_map_1.parseKnowledgeMap)(body.map, (0, knowledge_map_1.mapEvidence)(session), body.partial === true);
        const concept = map.nodes.find(node => node.id === body.nodeId);
        if (!concept)
            throw new Error("知识点不存在");
        if (!Array.isArray(body.previous) || body.previous.length > 5 || body.previous.some(text => typeof text !== "string" || text.length > 600))
            throw new Error("换题记录不合法");
        const adapter = (0, providers_1.getSessionProviderAdapter)(session, AbortSignal.any([request.signal, AbortSignal.timeout(45000)]));
        if (!adapter.generateNodePractice)
            throw new Error("当前模型暂不支持知识点练习");
        const practice = (0, node_practice_1.parseNodePractice)(await adapter.generateNodePractice(session, concept, body.previous));
        return Response.json({ practice }, { headers: { "Cache-Control": "no-store" } });
    }
    catch (error) {
        return (0, api_1.fail)(error);
    }
}
