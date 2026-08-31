import type { LearningSession, ProviderId, ReasoningLevel } from "../types";
import { LiveProviderAdapter, MockProviderAdapter, type ProviderAdapter } from "./adapter";
import { getProviderConfig } from "./config";

export function getProviderAdapter(id: ProviderId, reasoningLevel: ReasoningLevel = "light", signal?: AbortSignal): ProviderAdapter {
  const config = getProviderConfig(id, reasoningLevel);
  if (config.mock) return new MockProviderAdapter(id, reasoningLevel);
  if (!config.apiKey || !config.modelId) throw new Error(`${reasoningLabel(reasoningLevel)}推理尚未配置，不能开始分析`);
  return new LiveProviderAdapter(config, fetch, reasoningLevel, signal);
}

export function getSessionProviderAdapter(session: Pick<LearningSession, "provider" | "reasoningLevel" | "modelId" | "mode">, signal?: AbortSignal): ProviderAdapter {
  const adapter = getProviderAdapter(session.provider, session.reasoningLevel, signal);
  if (adapter.modelId !== session.modelId || adapter.mode !== session.mode) {
    throw new Error("本题使用的模型配置已变化，请返回首页重新拍题");
  }
  return adapter;
}

function reasoningLabel(level: ReasoningLevel): string {
  return level === "light" ? "轻度" : level === "medium" ? "中等" : "高强度";
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === "doubao" || value === "openai" || value === "xai";
}
