"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postKnowledgeConnection = postKnowledgeConnection;
const api_1 = require("../api");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const knowledge_connection_1 = require("../providers/knowledge-connection");
async function postKnowledgeConnection(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertContentLength)(request, 400000);
        (0, request_guards_1.assertRateLimit)(request, 20, `knowledge-connection:${(0, server_state_1.consentRateIdentity)(request) ?? request.headers.get("x-real-ip") ?? "local"}`);
        const body = await request.json();
        const session = (0, server_state_1.openSession)(body.stateToken);
        if (typeof body.messageId !== "string" || !body.messageId || body.messageId.length > 160 || typeof body.source !== "string" || body.source.trim().length < 30 || body.source.length > 60000)
            throw new Error("知识连接的讲解范围不合法");
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(28000)]);
        const connection = await (0, knowledge_connection_1.generateExplanationConnection)(session, body.source, signal);
        return Response.json({ messageId: body.messageId, connection }, { headers: { "Cache-Control": "no-store" } });
    }
    catch (error) {
        return (0, api_1.fail)(error);
    }
}
