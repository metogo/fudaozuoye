import { afterEach, describe, expect, it, vi } from "vitest";
import { canReuseIllustration } from "@/components/education-chat-app";
import { postSolutionGate, understandingGate } from "@/lib/learning/flow";
import { postTurn } from "@/lib/learning/http/turn";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { LiveProviderAdapter, MockProviderAdapter } from "@/lib/learning/providers/adapter";
import { getIllustrationAvailability } from "@/lib/learning/providers/config";
import { assembleIllustrationLesson, createMockIllustrationLesson, illustrationSolutionEvidence, parseGeneratedImages, parseIllustrationStoryboard } from "@/lib/learning/providers/illustration";
import { sealSession } from "@/lib/learning/server-state";
import type { ClientSessionState, IllustrationLesson, LearningSession, LearningTurnInput } from "@/lib/learning/types";

describe("原题分步插画", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it.each([2, 4, 6])("接受模型按题目需要决定的 %i 帧分镜", (count) => {
    const evidence = ["先提取题目中的已知关系。", "再确定每一份对应的数量。", "接着求出单位时间里的路程。", "然后把单位路程乘所求时间。", "随后核对时间和路程的对应关系。", "最后反向检查所得结果。"].slice(0, count);
    const visuals = ["黄色校车停在道路起点，旁边放着成组积木", "同一校车仍在起点，积木被平均分成若干组", "同一校车沿道路向前，积木保持等份排列", "同一校车继续向终点移动，积木组随之增加", "同一校车靠近终点，所有积木整齐排开", "同一校车到达终点，场景中的对象保持一致"];
    const solution = evidence.join("");
    const frames = Array.from({ length: count }, (_, index) => ({
      id: `frame-${index + 1}`,
      title: `有效步骤${index + 1}`,
      calculationEvidence: evidence[index],
      transition: index ? "承接上一幅继续演算" : "从原题条件开始",
      visualPrompt: visuals[index],
      alt: `第 ${index + 1} 步的关系示意图`,
    }));
    expect(parseIllustrationStoryboard({ title: "连续演算插画", frames }, solution).frames).toHaveLength(count);
  });

  it("拒绝凑数、越界和没有来自已核验解答的演算文字", () => {
    const base = { id: "frame-1", title: "第一步", calculationEvidence: "这是可信步骤。", transition: "从原题条件开始", visualPrompt: "黄色校车在道路左侧准备出发的具象场景", alt: "校车准备出发的场景" };
    expect(() => parseIllustrationStoryboard({ title: "连续演算插画", frames: [base] }, "这是可信步骤。")).toThrow("2 到 6");
    expect(() => parseIllustrationStoryboard({ title: "连续演算插画", frames: [base, { ...base, id: "frame-2", calculationEvidence: "这是编造答案。", visualPrompt: "黄色校车到达道路中央的具象场景" }] }, "这是可信步骤。")).toThrow("已核验解答");
    expect(() => parseIllustrationStoryboard({ title: "连续演算插画", frames: [base, { ...base, id: "frame-2" }] }, "这是可信步骤。")).toThrow("重复");
    expect(() => parseIllustrationStoryboard({ title: "连续演算插画", frames: [base, { ...base, id: "frame-2", calculationEvidence: "另一个可信步骤。", visualPrompt: "校车移动到第2段并显示x=3" }] }, "这是可信步骤。另一个可信步骤。")).toThrow("不允许");
  });

  it("完整生成先保留 Gate，关闭确认后才进入既有关键步骤回忆入口", async () => {
    const session = startedSession();
    const body = await turn(session, "view_illustration");
    const lesson = event<IllustrationLesson>(body, "illustration.complete");
    const next = event<ClientSessionState>(body, "flow.update");
    expect(eventNames(body).filter((name) => name === "illustration.frame")).toHaveLength(lesson.frameCount);
    expect(lesson.frameCount).toBeGreaterThanOrEqual(2);
    expect(lesson.frameCount).toBeLessThanOrEqual(6);
    expect(lesson.receipt).toBeTruthy();
    expect(next.session.flow.viewedSolution).toBe(false);
    expect(next.session.flow.activeGate?.kind).toBe("understanding");
    expect(eventNames(body).indexOf("illustration.complete")).toBeLessThan(eventNames(body).indexOf("flow.update"));
    const acknowledged = await turnInput(next.stateToken, { type: "acknowledge_illustration", gateId: next.session.flow.activeGate!.id, receipt: lesson.receipt! });
    const final = event<ClientSessionState>(acknowledged, "flow.update");
    expect(final.session.flow.viewedSolution).toBe(true);
    expect(final.session.flow.activeGate?.kind).toBe("solution_review");
  });

  it("拒绝伪造的插画完成凭证且不改变学习状态", async () => {
    const session = startedSession();
    const response = await postTurn(requestInput(sealSession(session), { type: "acknowledge_illustration", gateId: session.flow.activeGate!.id, receipt: "illustration-v1.fake" }));
    expect(await response.text()).toContain("凭证无效");
    expect(session.flow.viewedSolution).toBe(false);
  });

  it("少图或异常只保留已完成帧，不推进 Gate 与答案记录", async () => {
    const session = startedSession();
    vi.spyOn(MockProviderAdapter.prototype, "generateIllustrationLesson").mockImplementation(async (current, onFrame) => {
      const lesson = createMockIllustrationLesson(current);
      onFrame(lesson.frames[0], lesson.frameCount);
      throw new Error("图片生成未完整完成（1/3），学习进度未改变");
    });
    const body = await turn(session, "view_illustration");
    expect(eventNames(body)).toContain("illustration.frame");
    expect(eventNames(body)).not.toContain("illustration.complete");
    expect(eventNames(body)).not.toContain("flow.update");
    expect(body).toContain("学习进度未改变");
    expect(session.flow.viewedSolution).toBe(false);
    expect(session.flow.activeGate?.kind).toBe("understanding");
  });

  it("已通过关键步骤后重新生成不会回退到 solution-review", async () => {
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const gate = postSolutionGate();
    const session: LearningSession = { ...base, flow: { ...base.flow, stage: "solution_recall", viewedSolution: true, solutionRecallPassed: true, activeGate: gate } };
    const body = await turn(session, "view_illustration");
    const next = event<ClientSessionState>(body, "flow.update");
    expect(next.session.flow.stage).toBe("solution_recall");
    expect(next.session.flow.solutionRecallPassed).toBe(true);
    expect(next.session.flow.activeGate?.id).toBe(gate.id);
    expect(next.session.flow.activeGate?.kind).toBe("post_solution");
  });

  it("缺少图片模型配置时明确禁用且主 Gate 保持不变", async () => {
    vi.stubEnv("AI_MOCK_MODE", "false");
    vi.stubEnv("DOUBAO_API_KEY", "test-key");
    vi.stubEnv("DOUBAO_MODEL_ID", "test-model");
    vi.stubEnv("DOUBAO_IMAGE_MODEL_ID", "");
    const base = startedSession();
    const session = { ...base, mode: "live" as const, modelId: "test-model" };
    const response = await postTurn(request(session, "view_illustration"));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("DOUBAO_IMAGE_MODEL_ID");
    expect(session.flow.activeGate?.kind).toBe("understanding");
  });

  it("本页只复用同一题且完整的结果", () => {
    const session = startedSession();
    const lesson = { ...createMockIllustrationLesson(session), receipt: "signed-receipt" };
    expect(canReuseIllustration(lesson, session)).toBe(true);
    expect(canReuseIllustration({ ...lesson, requestId: "another" }, session)).toBe(false);
    expect(canReuseIllustration({ ...lesson, frames: lesson.frames.slice(1) }, session)).toBe(false);
    expect(canReuseIllustration({ ...lesson, problemFingerprint: "wrong" }, session)).toBe(false);
  });

  it("保留图片位置并拒绝 base64 或无效中间帧", () => {
    expect(parseGeneratedImages({ data: [{ url: "https://cdn.invalid/one.png" }, { b64_json: "YWJj" }, { url: "https://cdn.invalid/three.png" }] }, 3)).toEqual(["https://cdn.invalid/one.png", null, "https://cdn.invalid/three.png"]);
  });

  it("图片服务地址必须是无凭据的 HTTPS 地址", () => {
    vi.stubEnv("AI_MOCK_MODE", "false");
    vi.stubEnv("DOUBAO_API_KEY", " key ");
    vi.stubEnv("DOUBAO_IMAGE_MODEL_ID", " model ");
    vi.stubEnv("DOUBAO_IMAGE_BASE_URL", "http://image.provider.invalid/generate");
    expect(getIllustrationAvailability()).toMatchObject({ available: false, reason: expect.stringContaining("HTTPS") });
  });

  it("组装结果要求图片数量与模型决定的帧数完全一致", () => {
    const session = startedSession();
    const lesson = createMockIllustrationLesson(session);
    const storyboard = { title: lesson.title, frames: lesson.frames.map((frame) => ({ id: frame.id, title: frame.title, calculationEvidence: frame.calculation, transition: frame.transition, visualPrompt: "不同的连续场景描述内容", alt: frame.alt })) };
    expect(() => assembleIllustrationLesson(session, storyboard, [lesson.frames[0].imageUrl])).toThrow("未完整完成");
  });

  it("真实适配器按分镜数量调用方舟组图接口且密钥只在服务端请求头", async () => {
    vi.stubEnv("AI_MOCK_MODE", "false");
    vi.stubEnv("DOUBAO_API_KEY", "server-only-key");
    vi.stubEnv("DOUBAO_IMAGE_MODEL_ID", "seedream-test");
    vi.stubEnv("DOUBAO_IMAGE_BASE_URL", "https://image.provider.invalid/api/v3/images/generations");
    const session = startedSession();
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    const verified = illustrationSolutionEvidence(session);
    const evidence = root.check.explanation;
    const conclusion = `结论：${root.check.answer}`;
    expect(verified).toContain(conclusion);
    const calls: Array<{ url: string; body: Record<string, unknown>; authorization: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown>, authorization: new Headers(init?.headers).get("authorization") ?? "" });
      if (url.includes("images/generations")) return Response.json({ data: [{ url: "https://cdn.invalid/1.png" }, { url: "https://cdn.invalid/2.png" }] });
      if (JSON.stringify(calls.at(-1)?.body).includes("审核器")) return Response.json({ choices: [{ message: { content: JSON.stringify({ safe: true, reason: "画面无文字且与预期场景一致" }) } }] });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ title: "两步连续演示", frames: [
        { id: "frame-1", title: "先找关系", calculationEvidence: evidence, transition: "从原题条件开始", visualPrompt: "同一辆黄色校车在道路起点，旁边摆放三组相同积木", alt: "校车与三组相同积木表示已知关系" },
        { id: "frame-2", title: "完成演算", calculationEvidence: conclusion, transition: "保持同一校车和道路，承接上一幅完成变化", visualPrompt: "同一辆黄色校车行驶到道路终点，积木重新排成五组", alt: "校车到达终点并出现五组积木" },
      ] }) } }] });
    };
    const adapter = new LiveProviderAdapter({ id: "doubao", label: "豆包", apiKey: "server-only-key", modelId: "text-test", baseUrl: "https://text.provider.invalid/chat", protocol: "chat-completions", mock: false }, fetcher);
    const streamed: string[] = [];
    const lesson = await adapter.generateIllustrationLesson(session, (frame) => streamed.push(frame.imageUrl));
    const imageCall = calls.find((call) => call.url.includes("images/generations"))!;
    expect(imageCall.body).toMatchObject({ model: "seedream-test", sequential_image_generation: "auto", sequential_image_generation_options: { max_images: 2 }, watermark: false });
    expect(imageCall.authorization).toBe("Bearer server-only-key");
    expect(lesson.frameCount).toBe(2);
    expect(streamed).toEqual(["https://cdn.invalid/1.png", "https://cdn.invalid/2.png"]);
    expect(JSON.stringify(lesson)).not.toContain("server-only-key");
  });
});

function startedSession(): LearningSession {
  const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
  return { ...base, flow: { ...base.flow, stage: "core_explanation", activeGate: understandingGate("核心思路听懂了吗？") } };
}

function request(session: LearningSession, choice: "view_illustration") {
  return requestInput(sealSession(session), { type: "choose", gateId: session.flow.activeGate!.id, choice });
}

async function turn(session: LearningSession, choice: "view_illustration") {
  return (await postTurn(request(session, choice))).text();
}

function requestInput(stateToken: string, input: LearningTurnInput) {
  return new Request("http://localhost/api/learning/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stateToken, input }) });
}

async function turnInput(stateToken: string, input: LearningTurnInput) { return (await postTurn(requestInput(stateToken, input))).text(); }

function eventNames(body: string): string[] { return [...body.matchAll(/^event: (.+)$/gm)].map((match) => match[1]); }
function event<T>(body: string, name: string): T {
  const block = body.split("\n\n").find((item) => item.startsWith(`event: ${name}\n`));
  if (!block) throw new Error(`missing ${name}`);
  return JSON.parse(block.match(/^data: (.+)$/m)?.[1] ?? "null") as T;
}
