import { afterEach, describe, expect, it, vi } from "vitest";
import { postAnalyze } from "@/lib/learning/http/analyze";
import { CONSENT_COOKIE, createConsentValue } from "@/lib/learning/server-state";

const headers = () => ({ Cookie: `${CONSENT_COOKIE}=${createConsentValue()}`, "x-forwarded-for": `test-${crypto.randomUUID()}` });
const request = (form: FormData, extra: HeadersInit = {}) => new Request("http://localhost/api/learning/analyze", { method: "POST", headers: { ...headers(), ...extra }, body: form });
const form = (stage: string) => { const value = new FormData(); value.set("provider", "doubao"); value.set("reasoningLevel", "light"); value.set("stage", stage); return value; };

describe("分析接口输入边界", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("未同意、非法阶段和过大请求在模型调用前被拒绝", async () => {
    const noConsent = form("recognize_text"); noConsent.set("text", "完整题目");
    expect((await postAnalyze(new Request("http://localhost/api/learning/analyze", { method: "POST", body: noConsent }))).status).toBe(403);
    expect((await postAnalyze(request(form("unknown")))).status).toBe(400);
    const oversized = form("recognize_text"); oversized.set("text", "完整题目");
    const response = await postAnalyze(request(oversized, { "content-length": String(8 * 1024 * 1024) }));
    expect(response.status).toBe(413);
  });

  it("文本、图片与确认题目各自校验最小可用输入", async () => {
    const shortText = form("recognize_text"); shortText.set("text", "x");
    expect(await (await postAnalyze(request(shortText))).text()).toContain("请输入一道完整的题目");
    const noImage = form("recognize");
    expect(await (await postAnalyze(request(noImage))).text()).toContain("请先选择一道题的照片");
    const invalidImage = form("recognize"); invalidImage.set("image", new File(["not png"], "x.png", { type: "image/png" }));
    expect(await (await postAnalyze(request(invalidImage))).text()).toContain("图片内容与文件格式不一致");
    const full = form("full"); full.set("problem", JSON.stringify({ text: "x", childWork: "", subject: "math", gradeBand: "junior" }));
    expect(await (await postAnalyze(request(full))).text()).toContain("题目确认信息不合法");
  });

  it("生产环境严格检查来源，开发环境仍允许本地接口测试", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const value = form("recognize_text"); value.set("text", "这是一道完整题目");
    expect(await (await postAnalyze(request(value))).text()).toContain("请求来源不合法");
    vi.stubEnv("PUBLIC_APP_ORIGIN", "https://app.example.com");
    const accepted = form("recognize_text"); accepted.set("text", "这是一道完整题目");
    const response = await postAnalyze(request(accepted, { origin: "https://app.example.com" }));
    expect(response.status).toBe(200);
  });
});
