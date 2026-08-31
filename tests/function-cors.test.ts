import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { main } from "../functions/learning-api/src/index";

let baseUrl = "";

describe("云函数生产跨域", () => {
  beforeAll(async () => {
    vi.stubEnv("PUBLIC_APP_ORIGIN", "https://study.example.com");
    await new Promise<void>((resolve) => main.listen(0, "127.0.0.1", resolve));
    const address = main.address();
    if (!address || typeof address === "string") throw new Error("测试服务没有取得端口");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) => main.close((error) => error ? reject(error) : resolve()));
  });

  it("为配置的生产 H5 返回允许跨域响应头", async () => {
    const response = await fetch(`${baseUrl}/api/providers`, { method: "OPTIONS", headers: { Origin: "https://study.example.com" } });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://study.example.com");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("不会把跨域权限发给未配置来源", async () => {
    const response = await fetch(`${baseUrl}/api/providers`, { method: "OPTIONS", headers: { Origin: "https://evil.example.com" } });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("生产网关接管跨域时云函数不重复写响应头", async () => {
    vi.stubEnv("CORS_MANAGED_BY_GATEWAY", "true");
    const response = await fetch(`${baseUrl}/api/providers`, { method: "OPTIONS", headers: { Origin: "https://study.example.com" } });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    vi.stubEnv("CORS_MANAGED_BY_GATEWAY", "");
  });
});
