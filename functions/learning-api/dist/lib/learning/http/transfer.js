"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postTransfer = postTransfer;
const api_1 = require("../api");
const providers_1 = require("../providers");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
async function postTransfer(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertRateLimit)(request);
        (0, request_guards_1.assertContentLength)(request, 200_000);
        const body = await request.json();
        const session = (0, server_state_1.openSession)(body.stateToken);
        if (!session.originalPassed || session.stage !== "transfer_check")
            throw new Error("必须先由学生独立完成原题");
        const adapter = (0, providers_1.getSessionProviderAdapter)(session);
        const transferCheck = await adapter.generateTransferCheck(session);
        if (!transferCheck.prompt.trim() || !transferCheck.answer.trim() || !transferCheck.conceptId)
            throw new Error("迁移题未绑定有效知识点");
        return (0, api_1.ok)(session.provider, adapter.modelId, (0, server_state_1.toClientState)({ ...session, transferCheck, updatedAt: new Date().toISOString() }));
    }
    catch (error) {
        return (0, api_1.fail)(error);
    }
}
