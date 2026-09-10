"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestModelText = requestModelText;
const errors_1 = require("../errors");
const model_support_1 = require("./model-support");
const transient_fetch_1 = require("./transient-fetch");
async function requestModelText(context, system, prompt, imageDataUrl, jsonMode = false, timeoutMs = 60_000, externalSignal, maxTokens = 3000, onDelta) {
    const controller = new AbortController();
    const release = context.requests.track(controller);
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    context.signal?.addEventListener("abort", abort, { once: true });
    if (externalSignal?.aborted || context.signal?.aborted)
        controller.abort();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
        const response = await (0, transient_fetch_1.fetchWithTransientRetry)(context.fetcher, context.config.baseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${context.config.apiKey}` },
            body: JSON.stringify({ ...(context.config.protocol === "responses"
                    ? (0, model_support_1.responsesBody)(context.config.modelId, system, prompt, imageDataUrl, maxTokens)
                    : (0, model_support_1.chatBody)(context.config.modelId, system, prompt, imageDataUrl, jsonMode, context.config.id === "doubao", maxTokens)), ...(onDelta ? { stream: true } : {}) }),
            signal: controller.signal,
        });
        if (!response.ok)
            throw (0, errors_1.providerError)(`模型请求失败（${response.status}）`, response.status === 429 ? 429 : 502);
        if (onDelta)
            return await readTextStream(response, context.config.protocol, onDelta);
        const payload = await response.json();
        return (0, model_support_1.extractText)(payload, context.config.protocol);
    }
    catch (error) {
        if (error instanceof DOMException && error.name === "AbortError" && timedOut)
            throw (0, errors_1.providerError)("模型响应超时，请稍后重试同一模型", 504);
        throw error;
    }
    finally {
        controller.abort();
        clearTimeout(timeout);
        externalSignal?.removeEventListener("abort", abort);
        context.signal?.removeEventListener("abort", abort);
        release();
    }
}
async function readTextStream(response, protocol, onDelta) {
    if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream"))
        throw new Error("模型未建立流式连接");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "", output = "", terminal = false;
    const accept = (text) => {
        output += text;
        if (output.length > 60000)
            throw new Error("模型输出超过安全长度");
        onDelta(text);
    };
    try {
        while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            if (buffer.length > 100000)
                throw new Error("模型流式数据异常");
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            for (const line of lines)
                terminal = (0, model_support_1.emitProviderDelta)(line, protocol, accept) || terminal;
            if (done)
                break;
        }
        if (buffer.trim())
            terminal = (0, model_support_1.emitProviderDelta)(buffer, protocol, accept) || terminal;
        if (!terminal || !output.trim())
            throw new Error("模型输出未完整结束");
        return output;
    }
    finally {
        await reader.cancel();
        reader.releaseLock();
    }
}
