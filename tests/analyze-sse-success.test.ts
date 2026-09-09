import { describe, expect, it, vi } from "vitest";

const adapter = {
  mode: "live",
  modelId: "test-model",
  recognizeTextProblem: vi.fn(async (text: string) => ({ text, childWork: "", subject: "math", gradeBand: "junior" })),
  recognizeProblem: vi.fn(async () => ({ text: "图片题目", childWork: "作答", subject: "math", gradeBand: "junior" })),
  prepareChatSession: vi.fn(),
};

vi.mock("@/lib/learning/providers", () => ({ getProviderAdapter: () => adapter, isProviderId: (value: unknown) => value === "doubao" }));
vi.mock("@/lib/learning/request-guards", () => ({ assertSameOrigin: vi.fn(), assertContentLength: vi.fn(), assertRateLimit: vi.fn(), assertImageFile: vi.fn(async () => undefined) }));
vi.mock("@/lib/learning/server-state", () => ({ consentRateIdentity: () => "test", hasValidConsent: () => true, toClientState: (session: unknown) => session }));
vi.mock("@/lib/learning/mock-engine", () => ({ isBuiltInMockProblem: () => true }));

import { postAnalyze } from "@/lib/learning/http/analyze";

function request(form: FormData) {
  return new Request("http://localhost/api/learning/analyze", { method: "POST", body: form });
}
function base(stage: string) {
  const form = new FormData();
  form.set("provider", "doubao"); form.set("reasoningLevel", "light"); form.set("stage", stage);
  return form;
}

describe("分析接口的成功 SSE", () => {
  it("缺图题不能绕过界面直接开始分析", async () => {
    adapter.prepareChatSession.mockClear();
    const form = base("full");
    form.set("problem", JSON.stringify({ text: "如图求阴影面积", childWork: "", subject: "math", gradeBand: "junior", missingVisualInformation: ["阴影区域的边界"] }));
    const response = await postAnalyze(request(form));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("阴影区域的边界");
    expect(adapter.prepareChatSession).not.toHaveBeenCalled();
  });

  it("文本题识别会依次返回阶段、识别结果、性能记录与完成事件", async () => {
    const form = base("recognize_text"); form.set("text", "求一元二次方程的根");
    const response = await postAnalyze(request(form));
    const body = await response.text();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(adapter.recognizeTextProblem).toHaveBeenCalledWith("求一元二次方程的根");
    expect(body).toContain("event: phase");
    expect(body).toContain('"key":"recognizing"');
    expect(body).toContain("event: recognized");
    expect(body).toContain("event: perf.phase");
    expect(body).toContain("event: complete");
  });

  it("图片题识别把图像内容交给模型并保持同一套 SSE 协议", async () => {
    const form = base("recognize"); form.set("image", new File(["image-bytes"], "q.png", { type: "image/png" }));
    const response = await postAnalyze(request(form));
    const body = await response.text();
    expect(adapter.recognizeProblem).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/));
    expect(body).toContain("正在识别题干与你的作答");
    expect(body).toContain("图片题目");
    expect(body).toContain("event: complete");
  });
});
