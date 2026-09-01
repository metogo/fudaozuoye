"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postBoardCache = postBoardCache;
const board_cache_1 = require("../board-cache");
const errors_1 = require("../errors");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
async function postBoardCache(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertRateLimit)(request, 30);
        (0, request_guards_1.assertContentLength)(request, 240_000);
        const body = await request.json();
        const session = (0, server_state_1.openSession)(body.stateToken);
        const lesson = (0, board_cache_1.restoreBoardLesson)(session, body.lesson);
        if (!lesson)
            throw new Error("保存的板书没有通过可靠性复检");
        return Response.json({ schemaVersion: "1.0", data: { lesson }, error: null });
    }
    catch (error) {
        const serviceError = error instanceof errors_1.ServiceError ? error : null;
        return Response.json({
            schemaVersion: "1.0",
            data: null,
            error: { code: serviceError?.code ?? "INVALID_BOARD_CACHE", message: error instanceof Error ? error.message : "板书缓存复检失败", retryable: serviceError?.retryable ?? false },
        }, { status: serviceError?.status ?? 400 });
    }
}
