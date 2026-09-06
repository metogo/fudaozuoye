import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/lazy-rich-learning-text", async () => ({
  ...await import("@/components/rich-learning-text"),
  preloadLearningText: () => import("@/components/rich-learning-text"),
}));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseStepExercise, stepSourceSegments } from "@/lib/learning/step-exercise";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { understandingGate } from "@/lib/learning/flow";
import { openSession, sealSession, toClientState } from "@/lib/learning/server-state";
import { postTurn } from "@/lib/learning/http/turn";
import { MockProviderAdapter } from "@/lib/learning/providers/mock-adapter";
import { StepBlank } from "@/components/step-blank";
import { RichLearningText } from "@/components/rich-learning-text";
import { prepareStepAnswerMarkdown } from "@/lib/learning/step-answer-format";
import { deterministicAnswerMatch } from "@/lib/learning/providers/assessment";
import type { ClientSessionState, LearningTurnInput } from "@/lib/learning/types";

const source = "方程有两个实数根，因此判别式必须大于等于零。";
const raw = { sourceQuote: source, instruction: "把有实数根转成判别式条件", before: "$\\Delta=36-4k$", after: "$0$", answer: "≥", explanation: "有两个实数根包括相等的两个根，因此是大于等于。", hint: "想想两个相等的实数根是否也符合题意。" };
let index = 0;
function request(stateToken: string, input: LearningTurnInput, image = false) {
  const headers = { "x-forwarded-for": `step-test-${++index}` };
  if (!image) return new Request("http://localhost/api/learning/turn", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ stateToken, input }) });
  const form = new FormData(); form.set("stateToken", stateToken); form.set("input", JSON.stringify(input));
  form.set("image", new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], "step.png", { type: "image/png" }));
  return new Request("http://localhost/api/learning/turn", { method: "POST", headers, body: form });
}
function event<T>(body: string, name: string): T { return JSON.parse(body.split("\n\n").find((part) => part.startsWith(`event: ${name}\n`))!.match(/^data: (.+)$/m)![1]); }
async function start() {
  const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
  session.flow = { ...session.flow, stage: "core_explanation", activeGate: understandingGate() };
  vi.spyOn(MockProviderAdapter.prototype, "generateStepExercise").mockImplementation(async () => parseStepExercise(raw, source));
  const body = await (await postTurn(request(sealSession(session), { type: "choose", gateId: session.flow.activeGate!.id, choice: "try", boardContext: [{ id: "last", role: "assistant", text: source }] }))).text();
  return event<ClientSessionState>(body, "flow.update");
}
describe("当前步骤填空", () => {
  it.each(["\\geq 0", "\\leq 0", "\\frac{1}{\\sqrt{2}}", "$\\geq 0$"])("显示答案在空内渲染公式而非裸代码：%s", async (answer) => {
    const state = await start();
    const gate = { ...state.session.flow.activeGate!, stepAnswer: { answer, explanation: "依据原题" } };
    const html = renderToStaticMarkup(createElement(StepBlank, { gate, busy: false, onHint: () => {}, onContinue: () => {} }));
    const slot = html.match(/class="step-blank__slot"[^>]*>([\s\S]*?)<\/button>/)![1];
    expect(slot).toContain('class="katex"');
    expect(slot).not.toContain("katex-error");
    expect(html).toContain("看懂了，继续");
    expect(gate.stepAnswer.answer).toBe(answer);
  });
  it("使用服务端原文编号，避免公式重新抄写导致匹配失败", () => {
    const displayed = "已知方程。\n\n判别式 $\\Delta=b^2-4ac$，有实根时 $\\Delta\\geq0$。";
    const { sourceQuote: _quote, ...exercise } = raw;
    void _quote;
    expect(stepSourceSegments(displayed)[1]).toEqual({ id: "step-source-2", text: displayed.split("\n\n")[1] });
    expect(parseStepExercise({ ...exercise, sourceId: "step-source-2" }, displayed).check.answer).toBe(raw.answer);
    expect(() => parseStepExercise({ ...exercise, sourceId: "step-source-99" }, displayed)).toThrow("编号无效");
    expect(() => parseStepExercise({ ...exercise, sourceId: "step-source-1" }, "")).toThrow("编号无效");
  });
  it("直接查看当前空答案，旧会话兼容且不记录独立掌握", async () => {
    const state = await start(); const gateId = state.session.flow.activeGate!.id;
    expect(state.session.flow.activeGate?.stepAnswer).toBeUndefined();
    const oldSession = openSession(state.stateToken);
    oldSession.flow.activeGate!.options = oldSession.flow.activeGate!.options!.filter((option) => option.id !== "view_step_answer");
    const body = await (await postTurn(request(sealSession(oldSession), { type: "choose", gateId, choice: "view_step_answer" }))).text();
    const revealed = event<ClientSessionState>(body, "flow.update");
    expect(revealed.session.flow.activeGate?.id).toBe(gateId);
    expect(revealed.session.flow.activeGate?.stepAnswer).toEqual({ answer: raw.answer, explanation: raw.explanation });
    expect(revealed.session.stepCheck?.answer).toBe("");
    expect(revealed.session.evidence).toEqual(state.session.evidence);
    expect(body).not.toContain("answer.result");
    const html = renderToStaticMarkup(createElement(StepBlank, { gate: revealed.session.flow.activeGate!, busy: false, onHint: () => {} }));
    expect(html).toContain("看懂了，继续");
    expect(html).toMatch(/class="step-blank__slot"[^>]*>[\s\S]*?≥[\s\S]*?<\/button>/);
    expect(html).not.toContain("查看这个空的答案");
    expect(html).not.toContain("填写依据");
    const correct = await (await postTurn(request(revealed.stateToken, { type: "answer", gateId, answer: raw.answer }))).text();
    expect(event<{assisted: boolean}>(correct, "answer.result").assisted).toBe(true);
    expect(event<ClientSessionState>(correct, "flow.update").session.originalPassed).toBe(false);
    expect((await postTurn(request(state.stateToken, { type: "choose", gateId: "old", choice: "view_step_answer" }))).status).toBe(400);
  });
  it("关系符号不能被数字匹配忽略", () => {
    expect(deterministicAnswerMatch("Δ≥0", "Δ<0")).toBe(false);
    expect(deterministicAnswerMatch("Δ≥0", "Δ>0")).toBe(false);
    expect(deterministicAnswerMatch("Δ≥0", "$\\Delta\\geq0$")).toBe(true);
    expect(deterministicAnswerMatch("Δ≥0", "0≤Δ")).toBe(true);
    expect(deterministicAnswerMatch("≥", ">")).toBe(false);
  });
  afterEach(() => vi.restoreAllMocks());
  it("显示答案后可继续学习，兼容旧卡片且不提交评分", async () => {
    const state = await start(); const gateId = state.session.flow.activeGate!.id;
    expect((await postTurn(request(state.stateToken, { type: "choose", gateId, choice: "continue" }))).status).toBe(400);
    const revealBody = await (await postTurn(request(state.stateToken, { type: "choose", gateId, choice: "view_step_answer" }))).text();
    const revealed = event<ClientSessionState>(revealBody, "flow.update");
    const verify = vi.spyOn(MockProviderAdapter.prototype, "verifyAnswer");
    const body = await (await postTurn(request(revealed.stateToken, { type: "choose", gateId, choice: "continue" }))).text();
    const next = event<ClientSessionState>(body, "flow.update").session;
    expect(next.flow.activeGate?.kind).not.toBe("step_answer");
    expect(next.evidence).toEqual(state.session.evidence);
    expect(next.originalPassed).toBe(false);
    expect(verify).not.toHaveBeenCalled();
    expect(body).not.toContain("answer.result");
  });
  it("只生成一个有来源的空，拒绝无关引用和多个空", () => {
    expect(parseStepExercise(raw, source).blank.after).toBe("$0$");
    expect(() => parseStepExercise(raw, "另一道题")).toThrow("未对应");
    expect(() => parseStepExercise({ ...raw, before: "___和___" }, source)).toThrow("一个关键空");
  });
  it("点击尝试不切换为整题作答，客户端不包含填空答案", async () => {
    const state = await start();
    expect(state.session.flow.activeGate?.kind).toBe("step_answer");
    expect(state.session.flow.stage).toBe("core_explanation");
    expect(state.session.stepCheck?.answer).toBe("");
    expect(openSession(state.stateToken).stepCheck?.answer).toBe("≥");
    expect(toClientState(openSession(state.stateToken)).session.stepCheck?.explanation).toBe("");
  });
  it.each([0.5, 0.99])("手写识别置信度 %s 也只回填，不验证答案", async (confidence) => {
    const state = await start();
    const verify = vi.spyOn(MockProviderAdapter.prototype, "verifyAnswer");
    vi.spyOn(MockProviderAdapter.prototype, "transcribeStudentAnswer").mockResolvedValue({ text: "\\geq 0", confidence });
    const body = await (await postTurn(request(state.stateToken, { type: "transcribe_step", gateId: state.session.flow.activeGate!.id }, true))).text();
    expect(event<{needsConfirmation: boolean}>(body, "input.transcribed").needsConfirmation).toBe(true);
    const transcribed = event<{text: string}>(body, "input.transcribed").text;
    expect(transcribed).toBe("\\geq 0");
    const rendered = renderToStaticMarkup(createElement(RichLearningText, { text: prepareStepAnswerMarkdown(transcribed), compact: true }));
    expect(rendered).toContain('class="katex"');
    expect(rendered).toContain("≥");
    expect(verify).not.toHaveBeenCalled(); expect(body).not.toContain("answer.result"); expect(body).not.toContain("flow.update");
  });
  it("答错和求提示保留同一个空，答对也不算整题掌握", async () => {
    const state = await start(); const gateId = state.session.flow.activeGate!.id;
    const verify = vi.spyOn(MockProviderAdapter.prototype, "verifyAnswer").mockResolvedValue({ passed: false, explanation: "不透露答案" });
    const wrong = await (await postTurn(request(state.stateToken, { type: "answer", gateId, answer: ">" }))).text();
    expect(event<ClientSessionState>(wrong, "flow.update").session.flow.activeGate?.id).toBe(gateId);
    const hint = await (await postTurn(request(state.stateToken, { type: "choose", gateId, choice: "not_understood" }))).text();
    expect(hint).toContain(raw.hint); expect(event<ClientSessionState>(hint, "flow.update").session.flow.activeGate?.id).toBe(gateId);
    verify.mockResolvedValue({ passed: true, explanation: "正确" });
    const correct = await (await postTurn(request(state.stateToken, { type: "answer", gateId, answer: "≥" }))).text();
    const next = event<ClientSessionState>(correct, "flow.update").session;
    expect(next.flow.activeGate?.kind).toBe("understanding"); expect(next.originalPassed).toBe(false);
    expect(next.evidence).toEqual(state.session.evidence);
  });
  it("拒绝旧任务识别，不让手写串到另一个空", async () => {
    const state = await start();
    const response = await postTurn(request(state.stateToken, { type: "transcribe_step", gateId: "old" }, true));
    expect(response.status).toBe(400);
  });
  it("空白时也能显示答案，不再提供检查操作", async () => {
    const state = await start();
    const html = renderToStaticMarkup(createElement(StepBlank, { gate: state.session.flow.activeGate!, busy: false, onReveal: () => {}, onHint: () => {} }));
    expect(html).toContain("点击填写这个空"); expect(html).toContain("显示答案"); expect(html).not.toContain("检查这一步"); expect(html).not.toContain("请在下方输入"); expect(html).not.toContain("≥");
    expect(html).not.toContain('disabled=""');
  });
});
