"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMockMode = isMockMode;
exports.getProviderConfig = getProviderConfig;
exports.listReasoningAvailability = listReasoningAvailability;
exports.getIllustrationConfig = getIllustrationConfig;
exports.getIllustrationAvailability = getIllustrationAvailability;
exports.listProviderAvailability = listProviderAvailability;
const labels = {
    doubao: { label: "豆包", description: "默认模型，适合中文题目与讲解" },
    openai: { label: "GPT", description: "可选模型，需单独完成数据合规配置" },
    xai: { label: "Grok", description: "可选模型，需单独完成数据合规配置" },
};
function isMockMode() {
    const raw = process.env.AI_MOCK_MODE?.trim().toLowerCase();
    if (raw && raw !== "true" && raw !== "false")
        throw new Error("AI_MOCK_MODE 只能设置为 true 或 false");
    return raw === "true";
}
function getProviderConfig(id, reasoningLevel = "light") {
    const mock = isMockMode();
    const configs = {
        doubao: {
            apiKey: process.env.DOUBAO_API_KEY ?? "",
            modelId: doubaoModelId(reasoningLevel),
            baseUrl: process.env.DOUBAO_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
            protocol: "chat-completions",
        },
        openai: {
            apiKey: process.env.OPENAI_API_KEY ?? "",
            modelId: process.env.OPENAI_MODEL_ID ?? "",
            baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1/responses",
            protocol: "responses",
        },
        xai: {
            apiKey: process.env.XAI_API_KEY ?? "",
            modelId: process.env.XAI_MODEL_ID ?? "",
            baseUrl: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1/responses",
            protocol: "responses",
        },
    };
    return { id, label: labels[id].label, mock, ...configs[id] };
}
function listReasoningAvailability() {
    const mock = isMockMode();
    const apiKey = process.env.DOUBAO_API_KEY ?? "";
    return ["light", "medium", "high"].map((id) => ({
        id,
        label: id === "light" ? "轻度" : id === "medium" ? "中" : "高",
        available: mock || Boolean(apiKey && doubaoModelId(id)),
    }));
}
function getIllustrationConfig() {
    return {
        apiKey: process.env.DOUBAO_API_KEY?.trim() ?? "",
        modelId: process.env.DOUBAO_IMAGE_MODEL_ID?.trim() ?? "",
        baseUrl: process.env.DOUBAO_IMAGE_BASE_URL?.trim() || "https://ark.cn-beijing.volces.com/api/v3/images/generations",
        mock: isMockMode(),
    };
}
function getIllustrationAvailability() {
    return { available: true };
}
function doubaoModelId(level) {
    if (level === "medium")
        return process.env.DOUBAO_MODEL_ID_MEDIUM ?? "";
    if (level === "high")
        return process.env.DOUBAO_MODEL_ID_HIGH ?? "";
    return process.env.DOUBAO_MODEL_ID ?? "";
}
function listProviderAvailability() {
    return ["doubao", "openai", "xai"].map((id) => {
        const config = getProviderConfig(id);
        const liveReady = Boolean(config.apiKey && config.modelId);
        return {
            id,
            label: labels[id].label,
            description: labels[id].description,
            available: config.mock || liveReady,
            mode: config.mock ? "demo" : liveReady ? "live" : "unavailable",
        };
    });
}
