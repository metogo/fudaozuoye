"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postConsent = postConsent;
const request_guards_1 = require("../request-guards");
const config_1 = require("../providers/config");
const server_state_1 = require("../server-state");
async function postConsent(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertRateLimit)(request, 60);
        const headers = new Headers({ "Content-Type": "application/json" });
        headers.append("Set-Cookie", `${server_state_1.CONSENT_COOKIE}=${(0, server_state_1.createConsentValue)()}; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
        return new Response(JSON.stringify({ accepted: true, version: "guardian-v1", providers: (0, config_1.listProviderAvailability)(), reasoningLevels: (0, config_1.listReasoningAvailability)(), illustration: (0, config_1.getIllustrationAvailability)() }), { headers });
    }
    catch (error) {
        return Response.json({ accepted: false, message: error instanceof Error ? error.message : "无法记录监护人同意" }, { status: 400 });
    }
}
