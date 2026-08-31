"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readSseResponse = readSseResponse;
async function readSseResponse(response, onEvent) {
    if (!response.ok || !response.body)
        throw new Error(await responseErrorMessage(response));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;
    const parse = async (block) => {
        const event = block.match(/^event: (.+)$/m)?.[1];
        const raw = block.match(/^data: (.+)$/m)?.[1];
        if (!event || !raw)
            return;
        const data = JSON.parse(raw);
        if (event === "error")
            throw new Error(String(data.message ?? "流式请求失败"));
        if (event === "complete")
            completed = true;
        await onEvent(event, data);
    };
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks)
            await parse(block);
    }
    if (buffer.trim())
        await parse(buffer);
    if (!completed)
        throw new Error("流式连接意外中断，请重试当前操作");
}
async function responseErrorMessage(response) {
    const text = await response.text();
    try {
        const payload = JSON.parse(text);
        return payload.error?.message?.trim() || "流式请求失败";
    }
    catch {
        return text || "流式请求失败";
    }
}
