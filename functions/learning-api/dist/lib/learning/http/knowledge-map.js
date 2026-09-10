"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postKnowledgeMap = postKnowledgeMap;
const api_1 = require("../api");
const providers_1 = require("../providers");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const knowledge_map_1 = require("../knowledge-map");
const knowledge_map_stream_1 = require("./knowledge-map-stream");
async function postKnowledgeMap(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertContentLength)(request, 200000);
        (0, request_guards_1.assertRateLimit)(request, 12, `knowledge-map:${(0, server_state_1.consentRateIdentity)(request) ?? request.headers.get("x-real-ip") ?? "local"}`);
        const body = await request.json();
        const session = (0, server_state_1.openSession)(body.stateToken);
        // The progressive response owns its plan-sized deadline; detail/legacy requests remain bounded separately.
        const signal = body.stream === true && body.nodeId === undefined ? request.signal : AbortSignal.any([request.signal, AbortSignal.timeout(45000)]);
        const adapter = (0, providers_1.getSessionProviderAdapter)(session, signal);
        if (body.nodeId !== undefined) {
            const map = (0, knowledge_map_1.parseKnowledgeMap)(body.map, (0, knowledge_map_1.mapEvidence)(session), body.partial === true);
            if (typeof body.nodeId !== "string" || !map.nodes.some(n => n.id === body.nodeId))
                throw new Error("知识点不存在");
            if (!adapter.generateKnowledgeDetail)
                throw new Error("当前模型暂不支持知识详情");
            const detail = await adapter.generateKnowledgeDetail(session, map, body.nodeId);
            return Response.json({ detail }, { headers: { "Cache-Control": "no-store" } });
        }
        if (body.stream === true) {
            if (!adapter.streamKnowledgeMap)
                throw new Error("当前模型暂不支持知识图谱");
            return (0, knowledge_map_stream_1.knowledgeMapResponse)(adapter, session, signal, body.earlyRoot === true);
        }
        if (!adapter.generateKnowledgeMap)
            throw new Error("演示模式暂不生成知识图谱，请使用已配置的模型");
        // Separate read-only request: never changes gates, answers or mastery state.
        const map = await adapter.generateKnowledgeMap(session);
        return Response.json({ map }, { headers: { "Cache-Control": "no-store" } });
    }
    catch (error) {
        return (0, api_1.fail)(error);
    }
}
