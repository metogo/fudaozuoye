"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProviderAdapter = getProviderAdapter;
exports.getSessionProviderAdapter = getSessionProviderAdapter;
exports.isProviderId = isProviderId;
const adapter_1 = require("./adapter");
const config_1 = require("./config");
function getProviderAdapter(id, reasoningLevel = "light", signal) {
    const config = (0, config_1.getProviderConfig)(id, reasoningLevel);
    if (config.mock)
        return new adapter_1.MockProviderAdapter(id, reasoningLevel);
    if (!config.apiKey || !config.modelId)
        throw new Error(`${reasoningLabel(reasoningLevel)}推理尚未配置，不能开始分析`);
    return new adapter_1.LiveProviderAdapter(config, fetch, reasoningLevel, signal);
}
function getSessionProviderAdapter(session, signal) {
    const adapter = getProviderAdapter(session.provider, session.reasoningLevel, signal);
    if (adapter.modelId !== session.modelId || adapter.mode !== session.mode) {
        throw new Error("本题使用的模型配置已变化，请返回首页重新拍题");
    }
    return adapter;
}
function reasoningLabel(level) {
    return level === "light" ? "轻度" : level === "medium" ? "中等" : "高强度";
}
function isProviderId(value) {
    return value === "doubao" || value === "openai" || value === "xai";
}
