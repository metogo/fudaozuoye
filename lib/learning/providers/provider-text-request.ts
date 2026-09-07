import { providerError } from "../errors";
import type { ProviderConfig } from "./config";
import { chatBody, responsesBody, extractText, type JsonObject } from "./model-support";
import { RequestControllerRegistry } from "./request-controller-registry";
import { fetchWithTransientRetry } from "./transient-fetch";

export interface TextRequestContext { config: ProviderConfig; fetcher: typeof fetch; requests: RequestControllerRegistry; signal?: AbortSignal }

export async function requestModelText(context: TextRequestContext, system: string, prompt: string, imageDataUrl?: string, jsonMode = false, timeoutMs = 60_000, externalSignal?: AbortSignal, maxTokens = 3000): Promise<string> {
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
        body: JSON.stringify(context.config.protocol === "responses"
          ? responsesBody(context.config.modelId, system, prompt, imageDataUrl, maxTokens)
          : chatBody(context.config.modelId, system, prompt, imageDataUrl, jsonMode, context.config.id === "doubao", maxTokens)),
        signal: controller.signal,
      });
      if (!response.ok) throw providerError(`模型请求失败（${response.status}）`, response.status === 429 ? 429 : 502);
      const payload = await response.json() as JsonObject;
      return extractText(payload, context.config.protocol);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError" && timedOut) throw providerError("模型响应超时，请稍后重试同一模型", 504);
      throw error;
    } finally { clearTimeout(timeout); externalSignal?.removeEventListener("abort", abort); context.signal?.removeEventListener("abort", abort); release(); }
}
