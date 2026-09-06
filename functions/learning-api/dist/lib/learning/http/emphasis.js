"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postEmphasis = postEmphasis;
const api_1 = require("../api");
const providers_1 = require("../providers");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
async function postEmphasis(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertRateLimit)(request, 30, `emphasis:${(0, server_state_1.consentRateIdentity)(request) ?? request.headers.get("x-real-ip") ?? "local"}`);
        (0, request_guards_1.assertContentLength)(request, 210000);
        const body = await request.json();
        const session = (0, server_state_1.openSession)(body.stateToken);
        if (typeof body.source !== "string" || body.source.length < 30 || body.source.length > 16000 || typeof body.context !== "string" || body.context.length > 24000)
            throw new Error("重点标记上下文不合法");
        // Independent timeout and adapter: failure cannot cancel the teaching stream.
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20000)]);
        const adapter = (0, providers_1.getSessionProviderAdapter)(session, signal);
        const marks = await adapter.selectEmphasis?.(session, body.source, body.context) ?? [];
        return Response.json({ marks }, { headers: { "Cache-Control": "no-store" } });
    }
    catch (error) {
        return (0, api_1.fail)(error);
    }
}
