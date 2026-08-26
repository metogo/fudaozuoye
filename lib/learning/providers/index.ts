import type { ProviderId } from "../types";
import { LiveProviderAdapter, MockProviderAdapter, type ProviderAdapter } from "./adapter";
import { getProviderConfig } from "./config";

export function getProviderAdapter(id: ProviderId): ProviderAdapter {
  const config = getProviderConfig(id);
  if (config.mock) return new MockProviderAdapter(id);
  if (!config.apiKey || !config.modelId) throw new Error(`${config.label}尚未配置，不能开始分析`);
  return new LiveProviderAdapter(config);
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === "doubao" || value === "openai" || value === "xai";
}
