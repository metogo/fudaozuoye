"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProviderAdapter = getProviderAdapter;
exports.isProviderId = isProviderId;
const adapter_1 = require("./adapter");
const config_1 = require("./config");
function getProviderAdapter(id) {
    const config = (0, config_1.getProviderConfig)(id);
    if (config.mock)
        return new adapter_1.MockProviderAdapter(id);
    if (!config.apiKey || !config.modelId)
        throw new Error(`${config.label}尚未配置，不能开始分析`);
    return new adapter_1.LiveProviderAdapter(config);
}
function isProviderId(value) {
    return value === "doubao" || value === "openai" || value === "xai";
}
