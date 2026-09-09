"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProviders = getProviders;
const config_1 = require("../providers/config");
function getProviders() {
    return Response.json({ schemaVersion: "1.0", capabilities: { knowledgeMapStream: 1 }, providers: (0, config_1.listProviderAvailability)() }, { headers: { "Cache-Control": "no-store" } });
}
