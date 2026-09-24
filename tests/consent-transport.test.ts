import { afterEach, describe, expect, it, vi } from "vitest";
import { postConsent } from "@/lib/learning/http/consent";
import { postAnalyze } from "@/lib/learning/http/analyze";

const origin = "https://fudaozuoye.com";
afterEach(() => vi.unstubAllEnvs());

describe("同域初始化与真实服务端校验", () => {
  it("云运行时未设置 production 时，HTTPS 凭据仍有安全标记且不可缓存", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await postConsent(new Request(`${origin}/api/consent`, {
      method: "POST", headers: { Origin: origin },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict; Secure$/);
  });

  it("保留本地 HTTP 开发能力", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PUBLIC_APP_ORIGIN", "http://localhost:3000");
    const response = await postConsent(new Request("http://localhost:9000/api/consent", {
      method: "POST", headers: { Origin: "http://localhost:3000" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    expect(response.headers.get("set-cookie")).not.toContain("; Secure");
  });

  it("初始化后的凭据能进入参数校验；缺失、篡改和过期凭据仍拒绝", async () => {
    const response = await postConsent(new Request(`${origin}/api/consent`, {
      method: "POST", headers: { Origin: origin },
    }));
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    async function analyze(value?: string) {
      const form = new FormData();
      form.set("provider", "invalid-test-provider"); // 不调用模型，只验证安全边界。
      return postAnalyze(new Request(`${origin}/api/learning/analyze`, {
        method: "POST", headers: { Origin: origin, ...(value ? { Cookie: value } : {}) }, body: form,
      }));
    }
    const allowed = await analyze(cookie);
    expect(allowed.status).toBe(400);
    expect(await allowed.text()).toBe("推理强度或分析阶段不合法");
    expect((await analyze()).status).toBe(403);
    expect((await analyze(`${cookie}tampered`)).status).toBe(403);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 86400_001);
    try { expect((await analyze(cookie)).status).toBe(403); }
    finally { clock.mockRestore(); }
  });
});
