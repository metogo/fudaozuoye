"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postSolution = postSolution;
const providers_1 = require("../providers");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const solution_quality_1 = require("../solution-quality");
const sse_1 = require("./sse");
async function postSolution(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertRateLimit)(request, 20);
        (0, request_guards_1.assertContentLength)(request, 200_000);
        const body = await request.json();
        const session = (0, server_state_1.openSession)(body.stateToken);
        const adapter = (0, providers_1.getSessionProviderAdapter)(session);
        return (0, sse_1.sse)(async (send) => {
            send("meta", { schemaVersion: "1.0", provider: session.provider, modelId: adapter.modelId, requestId: session.requestId });
            let solution = "";
            await adapter.streamSolution(session.problem, (delta) => { solution += delta; send("delta", { text: delta }); }, () => { solution = ""; send("reset", { reason: "正在重新整理完整讲解" }); }, request.signal);
            (0, solution_quality_1.assertDetailedSolution)(solution, session.problem.text);
            send("complete", { provider: session.provider, modelId: adapter.modelId });
        });
    }
    catch (error) {
        return Response.json({ schemaVersion: "1.0", data: null, error: { code: "INVALID_REQUEST", message: error instanceof Error ? error.message : "请求失败", retryable: false } }, { status: 400 });
    }
}
