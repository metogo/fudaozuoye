import { providerError } from "../errors";
import type { ProviderConfig } from "./config";
import { chatBody, responsesBody, extractText, emitProviderDelta, type JsonObject } from "./model-support";
import { RequestControllerRegistry } from "./request-controller-registry";
import { fetchWithTransientRetry } from "./transient-fetch";

export interface TextRequestContext { config: ProviderConfig; fetcher: typeof fetch; requests: RequestControllerRegistry; signal?: AbortSignal }

export async function requestModelText(context: TextRequestContext, system: string, prompt: string, imageDataUrl?: string, jsonMode = false, timeoutMs = 60_000, externalSignal?: AbortSignal, maxTokens = 3000, onDelta?: (text: string) => void): Promise<string> {
    const controller = new AbortController();
    const release = context.requests.track(controller);
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    context.signal?.addEventListener("abort", abort, { once: true });
    if (externalSignal?.aborted || context.signal?.aborted) controller.abort();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchWithTransientRetry(context.fetcher, context.config.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${context.config.apiKey}` },
        body: JSON.stringify({ ...(context.config.protocol === "responses"
          ? responsesBody(context.config.modelId, system, prompt, imageDataUrl, maxTokens)
          : chatBody(context.config.modelId, system, prompt, imageDataUrl, jsonMode, context.config.id === "doubao", maxTokens)), ...(onDelta ? { stream: true } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) throw providerError(`模型请求失败（${response.status}）`, response.status === 429 ? 429 : 502);
      if (onDelta) return await readTextStream(response, context.config.protocol, onDelta);
      const payload = await response.json() as JsonObject;
      return extractText(payload, context.config.protocol);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError" && timedOut) throw providerError("模型响应超时，请稍后重试同一模型", 504);
      throw error;
    } finally { controller.abort(); clearTimeout(timeout); externalSignal?.removeEventListener("abort", abort); context.signal?.removeEventListener("abort", abort); release(); }
}

async function readTextStream(response: Response, protocol: ProviderConfig["protocol"], onDelta: (text: string) => void) {
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("模型未建立流式连接");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", output = "", terminal = false;
  const accept = (text: string) => {
    output += text;
    if (output.length > 60000) throw new Error("模型输出超过安全长度");
    onDelta(text);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 100000) throw new Error("模型流式数据异常");
      const lines = buffer.split(/\r?\n/); buffer = lines.pop()!;
      for (const line of lines) terminal = emitProviderDelta(line, protocol, accept) || terminal;
      if (done) break;
    }
    if (buffer.trim()) terminal = emitProviderDelta(buffer, protocol, accept) || terminal;
    if (!terminal || !output.trim()) throw new Error("模型输出未完整结束");
    return output;
  } finally { await reader.cancel(); reader.releaseLock(); }
}
