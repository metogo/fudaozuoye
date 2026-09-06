import { afterEach, describe, expect, it, vi } from "vitest";
import { postAnalyze } from "@/lib/learning/http/analyze";
import { CONSENT_COOKIE, createConsentValue } from "@/lib/learning/server-state";
import type { ClientSessionState, ProblemSnapshot } from "@/lib/learning/types";

describe("题目识别模式边界", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("演示模式上传图片时在 SSE 前拒绝，不返回固定车速题", async () => {
    vi.stubEnv("AI_MOCK_MODE", "true");
    const form = new FormData();
    form.set("provider", "doubao");
    form.set("reasoningLevel", "light");
    form.set("stage", "recognize");
    form.set("image", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "garden.png", { type: "image/png" }));
    const consent = createConsentValue();

    const response = await postAnalyze(new Request("http://localhost/api/learning/analyze", {
      method: "POST",
      headers: { Cookie: `${CONSENT_COOKIE}=${consent}` },
      body: form,
    }));
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).not.toContain("text/event-stream");
    expect(body).toContain("演示模式只支持内置代表题");
    expect(body).toContain("AI_MOCK_MODE=false");
    expect(body).not.toMatch(/event: (recognized|graph)/);
    expect(body).not.toContain("3 小时");
    expect(body).not.toContain("180 千米");
  });

  it("真实模式相继建立两道题时题干、请求 ID 和讲解证据彼此隔离", async () => {
    vi.stubEnv("AI_MOCK_MODE", "false");
    vi.stubEnv("DOUBAO_API_KEY", "test-key");
    vi.stubEnv("DOUBAO_MODEL_ID", "test-model");
    const firstProblem = problem("一辆车 3 小时行驶 180 千米，照这样的速度，5 小时行驶多少千米？");
    const secondProblem = problem("一个长方形菜园长18米，宽12米。如果长增加4米，宽不变，新的周长和增加的面积分别是多少？");
    const first = await analyzeConfirmed(firstProblem);
    const second = await analyzeConfirmed(secondProblem);
    const firstEvidence = first.session.nodes.find((node) => node.id === first.session.rootNodeId)?.diagnosticEvidence;
    const secondEvidence = second.session.nodes.find((node) => node.id === second.session.rootNodeId)?.diagnosticEvidence;

    expect(first.session.mode).toBe("live");
    expect(second.session.mode).toBe("live");
    expect(first.session.requestId).not.toBe(second.session.requestId);
    expect(first.session.problem.text).toBe(firstProblem.text);
    expect(second.session.problem.text).toBe(secondProblem.text);
    expect(firstEvidence).toBe(firstProblem.text);
    expect(secondEvidence).toBe(secondProblem.text);
    expect(second.session.problemGuide.keyClue).toContain("长方形菜园");
    expect(secondEvidence).not.toContain("180 千米");
  });

  it("无效阶段、缺少题目、空文本和不完整图片都会在路由层给出稳定错误", async () => {
    const consent = `${CONSENT_COOKIE}=${createConsentValue()}`;
    const request = async (form: FormData) => postAnalyze(new Request("http://localhost/api/learning/analyze", { method: "POST", headers: { Cookie: consent }, body: form }));
    const invalid = new FormData(); invalid.set("provider", "doubao"); invalid.set("reasoningLevel", "light"); invalid.set("stage", "bad");
    expect((await request(invalid)).status).toBe(400);
    const noPhoto = new FormData(); noPhoto.set("provider", "doubao"); noPhoto.set("reasoningLevel", "light"); noPhoto.set("stage", "recognize");
    expect(await (await request(noPhoto)).text()).toContain("请先选择");
    const emptyText = new FormData(); emptyText.set("provider", "doubao"); emptyText.set("reasoningLevel", "light"); emptyText.set("stage", "recognize_text"); emptyText.set("text", "x");
    expect(await (await request(emptyText)).text()).toContain("请输入一道完整的题目");
    const noProblem = new FormData(); noProblem.set("provider", "doubao"); noProblem.set("reasoningLevel", "light"); noProblem.set("stage", "full");
    expect(await (await request(noProblem)).text()).toContain("缺少已确认的题目");
  });
});

function problem(text: string): ProblemSnapshot {
  return { text, childWork: "", subject: "math", gradeBand: "primary", confidence: 1, userRevised: true };
}

async function analyzeConfirmed(problem: ProblemSnapshot): Promise<ClientSessionState> {
  const form = new FormData();
  form.set("provider", "doubao");
  form.set("reasoningLevel", "light");
  form.set("stage", "full");
  form.set("problem", JSON.stringify(problem));
  const response = await postAnalyze(new Request("http://localhost/api/learning/analyze", {
    method: "POST",
    headers: { Cookie: `${CONSENT_COOKIE}=${createConsentValue()}` },
    body: form,
  }));
  expect(response.status).toBe(200);
  const body = await response.text();
  const match = body.match(/event: graph\ndata: (.+)\n\n/);
  expect(match?.[1]).toBeTruthy();
  return JSON.parse(match![1]) as ClientSessionState;
}
