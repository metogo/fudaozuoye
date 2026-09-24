import { afterEach, describe, expect, it, vi } from "vitest";
import { learningApiUrl } from "@/lib/learning/api-url";

const cloudApi = "https://example.ap-shanghai.app.tcloudbase.com/api";
const paths = ["/consent", "/providers", "/learning/analyze", "/learning/turn",
  "/learning/knowledge-map", "/learning/knowledge-connection", "/learning/node-practice",
  "/learning/emphasis", "/learning/board-cache", "/learning/statistics"];

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("正式域名 API 不依赖第三方凭据", () => {
  it.each(["fudaozuoye.com", "www.fudaozuoye.com"])("%s 的所有学习接口使用同源路由", hostname => {
    vi.stubGlobal("window", { location: { hostname } });
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", cloudApi);
    for (const path of paths) expect(learningApiUrl(path)).toBe(`/api${path}`);
  });

  it.each(["localhost", "127.0.0.1", "preview.webapps.tcloudbase.com", "fudaozuoye.com.example.org"])(
    "%s 保留显式 API 配置，不误用正式域名路由", hostname => {
      vi.stubGlobal("window", { location: { hostname } });
      vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", `${cloudApi}/`);
      expect(learningApiUrl("/consent")).toBe(`${cloudApi}/consent`);
    });

  it("本地不同端口仍使用本地 API，不绕到生产", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:9000/api");
    expect(learningApiUrl("/learning/analyze")).toBe("http://localhost:9000/api/learning/analyze");
  });

  it("静态预渲染没有 window 时可构建", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", cloudApi);
    expect(learningApiUrl("/consent")).toBe(`${cloudApi}/consent`);
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", undefined);
    expect(learningApiUrl("/consent")).toBe("/api/consent");
  });
});
