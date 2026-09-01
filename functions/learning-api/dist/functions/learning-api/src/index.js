"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const node_http_1 = require("node:http");
const analyze_1 = require("../../../lib/learning/http/analyze");
const board_cache_1 = require("../../../lib/learning/http/board-cache");
const consent_1 = require("../../../lib/learning/http/consent");
const expand_1 = require("../../../lib/learning/http/expand");
const providers_1 = require("../../../lib/learning/http/providers");
const solution_1 = require("../../../lib/learning/http/solution");
const similar_1 = require("../../../lib/learning/http/similar");
const transfer_1 = require("../../../lib/learning/http/transfer");
const tutor_1 = require("../../../lib/learning/http/tutor");
const turn_1 = require("../../../lib/learning/http/turn");
const verify_1 = require("../../../lib/learning/http/verify");
const maximumRequestBytes = 8 * 1024 * 1024;
const routes = {
    "POST /consent": consent_1.postConsent,
    "GET /providers": providers_1.getProviders,
    "POST /learning/analyze": analyze_1.postAnalyze,
    "POST /learning/board-cache": board_cache_1.postBoardCache,
    "POST /learning/expand": expand_1.postExpand,
    "POST /learning/verify": verify_1.postVerify,
    "POST /learning/transfer": transfer_1.postTransfer,
    "POST /learning/solution": solution_1.postSolution,
    "POST /learning/similar": similar_1.postSimilarCheck,
    "POST /learning/tutor": tutor_1.postTutor,
    "POST /learning/turn": turn_1.postTurn,
};
exports.main = (0, node_http_1.createServer)((request, response) => {
    void handle(request, response);
});
if (require.main === module)
    exports.main.listen(Number(process.env.PORT ?? 9000), process.env.HOST?.trim() || "0.0.0.0");
async function handle(incoming, outgoing) {
    const requestAbort = new AbortController();
    incoming.once("aborted", () => requestAbort.abort());
    outgoing.once("close", () => requestAbort.abort());
    try {
        if (incoming.method === "OPTIONS") {
            const response = new Response(null, { status: 204, headers: corsHeaders(incoming) });
            await writeResponse(outgoing, response);
            return;
        }
        const request = await toWebRequest(incoming, requestAbort.signal);
        const path = normalizePath(new URL(request.url).pathname);
        const handler = routes[`${request.method} ${path}`];
        const response = handler ? await handler(request) : new Response("接口不存在", { status: 404 });
        for (const [key, value] of corsHeaders(incoming))
            response.headers.set(key, value);
        await writeResponse(outgoing, response);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "服务请求失败";
        await writeResponse(outgoing, new Response(message, { status: message.includes("过大") ? 413 : 500 }));
    }
}
function corsHeaders(incoming) {
    if (process.env.CORS_MANAGED_BY_GATEWAY === "true")
        return new Headers();
    const origin = incoming.headers.origin;
    const allowedOrigin = process.env.PUBLIC_APP_ORIGIN?.trim();
    if (!allowedOrigin || origin !== allowedOrigin)
        return new Headers();
    return new Headers({
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        Vary: "Origin",
    });
}
function normalizePath(pathname) {
    const path = pathname.replace(/^\/api(?=\/|$)/, "") || "/";
    return path.length > 1 ? path.replace(/\/$/, "") : path;
}
async function toWebRequest(incoming, signal) {
    const body = await readBody(incoming);
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
        if (typeof value === "string")
            headers.set(name, value);
        else if (value)
            headers.set(name, value.join(", "));
    }
    const origin = process.env.PUBLIC_APP_ORIGIN?.trim() || headers.get("origin") || `${headers.get("x-forwarded-proto") ?? "https"}://${headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost"}`;
    return new Request(new URL(incoming.url ?? "/", origin).toString(), { method: incoming.method, headers, body: body.length ? new Uint8Array(body) : undefined, signal });
}
async function readBody(incoming) {
    const parts = [];
    let size = 0;
    for await (const part of incoming) {
        const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
        size += chunk.length;
        if (size > maximumRequestBytes)
            throw new Error("请求内容过大");
        parts.push(chunk);
    }
    return Buffer.concat(parts);
}
async function writeResponse(outgoing, response) {
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.statusCode = response.status;
    if (!response.body) {
        outgoing.end();
        return;
    }
    const reader = response.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        outgoing.write(Buffer.from(value));
    }
    outgoing.end();
}
