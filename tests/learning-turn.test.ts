import { afterEach, describe, expect, it, vi } from "vitest";
import { postTurn } from "@/lib/learning/http/turn";
import { answerGate, understandingGate } from "@/lib/learning/flow";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { MockProviderAdapter } from "@/lib/learning/providers/adapter";
import { openSession, sealSession } from "@/lib/learning/server-state";
import type { ClientSessionState, LearningTurnInput } from "@/lib/learning/types";

let requestIndex = 0;

describe("教育 Chat 学习回合", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("先流式讲核心思路，再创建唯一理解任务", async () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const body = await turn(sealSession(session), { type: "start" });
    const next = event<ClientSessionState>(body, "flow.update");

    expect(body).toContain("event: message.delta");
    expect(body).toContain("event: message.complete");
    expect(body).toContain("event: flow.milestone");
    expect(next.session.flow.stage).toBe("core_explanation");
    expect(next.session.flow.activeGate?.kind).toBe("understanding");
    expect(next.session.flow.activeGate?.options?.map((item) => item.id)).toEqual(["continue", "try", "not_understood", "view_board", "full_solution"]);
    expect(next.session.flow.boardSuggestion).toBeNull();
    expect(body).toContain("event: flow.suggestions");
    expect(next.session.flow.suggestedQuestions).toHaveLength(2);
    const names = eventNames(body);
    expect(names.indexOf("flow.update")).toBeLessThan(names.indexOf("flow.ready"));
    expect(names.indexOf("flow.ready")).toBeLessThan(names.indexOf("flow.suggestions"));
  });

  it("后台标准解尚未完成时，首讲结束已经开放互动选项", async () => {
    let releasePreparation: (() => void) | undefined;
    vi.spyOn(MockProviderAdapter.prototype, "completeChatSession").mockImplementation((session) => new Promise((resolve) => {
      releasePreparation = () => resolve(analyzeMock(session.problem, "doubao"));
    }));
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.prepareChatSession(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    const response = await postTurn(request(sealSession(session), { type: "start" }));
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let earlyBody = "";
    while (!earlyBody.includes("event: flow.suggestions")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      earlyBody += decoder.decode(chunk.value, { stream: true });
    }
    expect(earlyBody).toContain("event: message.delta");
    expect(earlyBody).toContain("event: message.complete");
    expect(earlyBody).toContain("event: flow.update");
    expect(earlyBody).toContain("event: flow.ready");
    expect(earlyBody).toContain("event: flow.suggestions");
    expect(event<ClientSessionState>(earlyBody, "flow.update").session.flow.activeGate?.options?.map((item) => item.id)).toEqual(["continue", "try", "not_understood", "view_board", "full_solution"]);
    releasePreparation?.();
    while (!(await reader.read()).done) { /* drain */ }
  });

  it("临时 Gate 被新操作接管后，取消的首讲请求不会再回写旧状态", async () => {
    let releasePreparation: (() => void) | undefined;
    vi.spyOn(MockProviderAdapter.prototype, "completeChatSession").mockImplementation((session) => new Promise((resolve) => {
      releasePreparation = () => resolve(session);
    }));
    const controller = new AbortController();
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const response = await postTurn(request(sealSession(session), { type: "start" }, controller.signal));
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let body = "";
    while (!body.includes("event: flow.suggestions")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      body += decoder.decode(chunk.value, { stream: true });
    }
    controller.abort();
    releasePreparation?.();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      body += decoder.decode(chunk.value, { stream: true });
    }

    expect(eventNames(body).filter((name) => name === "flow.update")).toHaveLength(2);
  });

  it("临时状态立即点击验题动作时，服务端先补齐标准答案再继续", async () => {
    const mock = new MockProviderAdapter("doubao");
    const problem = await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary");
    const pending = await mock.prepareChatSession(problem);
    const gate = understandingGate("核心思路听懂了吗？");
    const provisional = {
      ...pending,
      nodes: pending.nodes.map((node) => node.id === pending.rootNodeId ? { ...node, attempts: 2, state: "learning" as const } : node),
      flow: { ...pending.flow, stage: "core_explanation" as const, activeGate: gate },
    };
    vi.spyOn(MockProviderAdapter.prototype, "completeChatSession").mockResolvedValue(analyzeMock(problem, "doubao"));

    const body = await turn(sealSession(provisional), { type: "choose", gateId: gate.id, choice: "try" });
    const next = event<ClientSessionState>(body, "flow.update");
    const root = openSession(next.stateToken).nodes.find((node) => node.id === next.session.rootNodeId);

    expect(next.session.flow.activeGate?.kind).toBe("original_answer");
    expect(root?.check.answer).not.toBe("等待后台核验");
    expect(root?.attempts).toBe(2);
    expect(root?.state).toBe("learning");
  });

  it("后台标准答案准备失败时，首讲互动 Gate 仍然可用", async () => {
    vi.spyOn(MockProviderAdapter.prototype, "completeChatSession").mockRejectedValue(new Error("standard answer unavailable"));
    const mock = new MockProviderAdapter("doubao");
    const prepared = await mock.prepareChatSession(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    const body = await turn(sealSession(prepared), { type: "start" });
    const next = event<ClientSessionState>(body, "flow.update");

    expect(body).toContain("event: flow.ready");
    expect(body).not.toContain("event: error");
    expect(next.session.flow.activeGate?.kind).toBe("understanding");
    expect(next.session.flow.activeGate?.options).toHaveLength(5);

    const boardBody = await turn(next.stateToken, { type: "choose", gateId: next.session.flow.activeGate!.id, choice: "view_board" });
    expect(boardBody).toContain("event: board.lesson");
  });

  it("猜你想问按密封 ID 引用当前讲解，回答后仍回到原任务", async () => {
    const started = await startState("physics", "junior");
    const gateId = started.session.flow.activeGate!.id;
    const suggestion = started.session.flow.suggestedQuestions[0];
    const body = await turn(started.stateToken, { type: "choose_suggestion", suggestionId: suggestion.id });
    const next = event<ClientSessionState>(body, "flow.update");

    expect(body).toContain("event: message.delta");
    expect(body).toContain("event: flow.resume");
    expect(next.session.flow.activeGate?.id).toBe(gateId);
    expect(next.session.flow.suggestedQuestions).toEqual([]);
  });

  it("拒绝客户端伪造或使用过期的猜你想问", async () => {
    const started = await startState("math", "junior");
    const response = await postTurn(request(started.stateToken, { type: "choose_suggestion", suggestionId: "suggest-forged" }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("推荐问题已更新");
  });

  it("板书是当前互动的专注呈现层，不会创建第二条学习路径", async () => {
    const started = await startState("math", "primary");
    const gate = started.session.flow.activeGate!;
    const body = await turn(started.stateToken, { type: "choose", gateId: gate.id, choice: "view_board" });
    const next = event<ClientSessionState>(body, "flow.update");
    const board = event<{ title: string; blocks: Array<{ id: string; content: string }>; annotations: Array<{ blockId: string; target: string; reason: string }> }>(body, "board.lesson");

    expect(board.title).toBeTruthy();
    expect(board.blocks).toHaveLength(5);
    expect(board.annotations.length).toBeGreaterThanOrEqual(3);
    expect(board.annotations.every((annotation) => board.blocks.find((block) => block.id === annotation.blockId)?.content.includes(annotation.target))).toBe(true);
    expect(board.annotations.every((annotation) => annotation.reason.length >= 8)).toBe(true);
    expect(next.session.flow.activeGate?.id).toBe(gate.id);
    expect(next.session.flow.stage).toBe("core_explanation");
  });

  it("板书通过适配器生成并携带当前对话上下文", async () => {
    const generator = vi.spyOn(MockProviderAdapter.prototype, "generateBoardLesson");
    const started = await startState("math", "primary");
    const gate = started.session.flow.activeGate!;
    const boardContext = [{ id: "assistant-current", role: "assistant" as const, text: "学生刚才卡在总量和每天工作量的关系。" }];
    const body = await turn(started.stateToken, { type: "choose", gateId: gate.id, choice: "view_board", boardContext });
    const instant = event<{ quality?: unknown; blocks: unknown[] }>(body, "board.lesson");
    expect(instant.blocks).toHaveLength(5);
    expect(body).toContain("学科原生板书已整理完成");
    expect(generator).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), boardContext);
  });

  it("模型板书生成失败时保留即时板书，当前互动与学习进度保持不变", async () => {
    enableFailingLiveProvider();
    const base = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const gate = understandingGate("核心关系听懂了吗？");
    const session = liveSession({ ...base, flow: { ...base.flow, stage: "core_explanation", activeGate: gate, boardSuggestion: { recommended: true, reason: "图形关系适合板书呈现。", layout: "relation" } } });
    const body = await turn(sealSession(session), { type: "choose", gateId: gate.id, choice: "view_board" });
    const next = event<ClientSessionState>(body, "flow.update");
    expect(body).toContain("event: board.lesson");
    expect(eventNames(body).filter((name) => name === "board.lesson")).toHaveLength(1);
    expect(body).not.toContain("event: presentation.unavailable");
    expect(next.session.flow.activeGate?.id).toBe(gate.id);
    expect(next.session.flow.stage).toBe("core_explanation");
  });

  it("自由追问后恢复原互动，不绕过学习任务", async () => {
    const started = await startState("physics", "junior");
    const gateId = started.session.flow.activeGate!.id;
    const body = await turn(started.stateToken, { type: "question", text: "为什么先看这个条件？" });
    const next = event<ClientSessionState>(body, "flow.update");

    expect(body).toContain("event: flow.resume");
    expect(next.session.flow.activeGate?.id).toBe(gateId);
    expect(next.session.flow.stage).toBe("core_explanation");
  });

  it("图片追问结合当前题目回答，并恢复原互动", async () => {
    const started = await startState("physics", "junior");
    const gateId = started.session.flow.activeGate!.id;
    const response = await postTurn(imageRequest(started.stateToken, { type: "image_question" }));
    expect(response.status).toBe(200);
    const body = await response.text();
    const next = event<ClientSessionState>(body, "flow.update");
    expect(body).toContain("event: message.delta");
    expect(body).toContain("event: flow.resume");
    expect(next.session.flow.activeGate?.id).toBe(gateId);
  });

  it("图片作答先公开识别内容，再沿用原题验收", async () => {
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = base.nodes.find((node) => node.id === base.rootNodeId)!;
    const checkedRoot = { ...root, check: { ...root.check, type: "short_text" as const, choices: undefined, answer: "3" } };
    const gate = answerGate("original_answer", "独立完成原题", checkedRoot.check.prompt, root.id);
    const session = { ...base, nodes: base.nodes.map((node) => node.id === root.id ? checkedRoot : node), flow: { ...base.flow, stage: "original_attempt" as const, activeGate: gate } };
    const response = await postTurn(imageRequest(sealSession(session), { type: "image_answer", gateId: gate.id }));
    expect(response.status).toBe(200);
    const body = await response.text();
    const transcription = event<{ text: string; needsConfirmation: boolean }>(body, "input.transcribed");
    const next = event<ClientSessionState>(body, "flow.update");
    expect(transcription).toEqual({ text: "3", confidence: 0.96, needsConfirmation: false });
    expect(body).toContain("event: answer.result");
    expect(next.session.originalPassed).toBe(true);
  });

  it("图片作答识别把握不足时保留 Gate，要求学生核对", async () => {
    vi.spyOn(MockProviderAdapter.prototype, "transcribeStudentAnswer").mockResolvedValue({ text: "3 或 8", confidence: 0.48 });
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = base.nodes.find((node) => node.id === base.rootNodeId)!;
    const gate = answerGate("original_answer", "独立完成原题", root.check.prompt, root.id);
    const session = { ...base, flow: { ...base.flow, stage: "original_attempt" as const, activeGate: gate } };
    const response = await postTurn(imageRequest(sealSession(session), { type: "image_answer", gateId: gate.id }));
    const body = await response.text();
    const transcription = event<{ text: string; needsConfirmation: boolean }>(body, "input.transcribed");
    const next = event<ClientSessionState>(body, "flow.update");
    expect(transcription.needsConfirmation).toBe(true);
    expect(body).not.toContain("event: answer.result");
    expect(next.session.flow.activeGate?.id).toBe(gate.id);
    expect(next.session.originalPassed).toBe(false);
  });

  it("图片输入必须携带真实图片文件", async () => {
    const started = await startState("math", "primary");
    const form = new FormData();
    form.set("stateToken", started.stateToken);
    form.set("input", JSON.stringify({ type: "image_question" }));
    const response = await postTurn(new Request("http://localhost/api/learning/turn", { method: "POST", body: form }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("请先选择要发送的图片");
  });

  it("选择题互动必须把可点击选项带到聊天卡片", async () => {
    const started = await startState("physics", "junior");
    const gate = started.session.flow.activeGate!;
    const body = await turn(started.stateToken, { type: "choose", gateId: gate.id, choice: "try" });
    const next = event<ClientSessionState>(body, "flow.update");
    const check = next.session.nodes.find((node) => node.id === next.session.flow.activeGate?.nodeId)?.check;

    expect(next.session.flow.activeGate?.kind).toBe("node_answer");
    expect(next.session.flow.activeGate?.answerChoices).toEqual(check?.choices);
    expect(next.session.flow.activeGate?.answerChoices?.length).toBeGreaterThanOrEqual(2);
  });

  it("选择题只接受当前实际展示的选项", async () => {
    const started = await startState("physics", "junior");
    const gate = started.session.flow.activeGate!;
    const answerState = event<ClientSessionState>(await turn(started.stateToken, { type: "choose", gateId: gate.id, choice: "try" }), "flow.update");
    const response = await postTurn(request(answerState.stateToken, { type: "answer", gateId: answerState.session.flow.activeGate!.id, answer: "__not_offered__" }));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("请从当前题目的选项中选择答案");
  });

  it("连续表示不懂会改变讲法并进入真实卡点", async () => {
    const started = await startState("math", "junior");
    const firstGate = started.session.flow.activeGate!;
    const firstBody = await turn(started.stateToken, { type: "choose", gateId: firstGate.id, choice: "not_understood" });
    const first = event<ClientSessionState>(firstBody, "flow.update");
    expect(firstBody).toContain("event: presentation.suggestion");
    expect(first.session.flow.remediationCount).toBe(1);
    expect(first.session.flow.focus.kind).toBe("problem");
    expect(first.session.flow.activeGate?.options?.some((option) => option.id === "view_board")).toBe(true);

    const secondBody = await turn(first.stateToken, { type: "choose", gateId: first.session.flow.activeGate!.id, choice: "not_understood" });
    const second = event<ClientSessionState>(secondBody, "flow.update");
    expect(second.session.flow.focus.kind).toBe("node");
    expect(second.session.flow.pathNodeIds).toContain(second.session.currentNodeId);
    expect(second.session.flow.activeGate?.options?.some((option) => option.id === "view_board")).toBe(true);
    expect(second.session.flow.boardSuggestion?.recommended).toBe(true);
    expect(secondBody).toContain("已经定位到卡点");
  });

  it("首讲会话不预生成知识卡，只有连续卡住才按需补入", async () => {
    const adapter = new MockProviderAdapter("doubao");
    const prepared = await adapter.prepareChatSession(await adapter.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    expect(prepared.nodes.filter((node) => node.kind === "concept")).toHaveLength(0);
    const started = event<ClientSessionState>(await turn(sealSession(prepared), { type: "start" }), "flow.update");
    expect(started.session.nodes.filter((node) => node.kind === "concept")).toHaveLength(0);

    const first = event<ClientSessionState>(await turn(started.stateToken, { type: "choose", gateId: started.session.flow.activeGate!.id, choice: "not_understood" }), "flow.update");
    expect(first.session.nodes.filter((node) => node.kind === "concept")).toHaveLength(0);
    const second = event<ClientSessionState>(await turn(first.stateToken, { type: "choose", gateId: first.session.flow.activeGate!.id, choice: "not_understood" }), "flow.update");
    expect(second.session.nodes.some((node) => node.kind === "concept")).toBe(true);
    expect(second.session.flow.focus.kind).toBe("node");
  });

  it("知识诊断失败会停在可继续提问的卡点，不会作废已开始的讲解", async () => {
    enableFailingLiveProvider();
    const mock = new MockProviderAdapter("doubao");
    const prepared = await mock.prepareChatSession(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    const gate = understandingGate("换个讲法后清楚了吗？");
    const session = liveSession({ ...prepared, flow: { ...prepared.flow, stage: "remediation", remediationCount: 1, activeGate: gate } });
    const body = await turn(sealSession(session), { type: "choose", gateId: gate.id, choice: "not_understood" });
    const next = event<ClientSessionState>(body, "flow.update");
    expect(body).toContain("event: flow.branch_error");
    expect(next.session.nodes.filter((node) => node.kind === "concept")).toHaveLength(0);
    expect(next.session.flow.activeGate?.kind).toBe("needs_help");
    expect(next.session.flow.stage).toBe("remediation");
  });

  it("原题错答后已有基础路径时直接回到可学节点，不会重复诊断到会话损坏", async () => {
    const base = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const gate = understandingGate("找到刚才出错的那一步了吗？");
    const session = { ...base, currentNodeId: base.rootNodeId, flow: { ...base.flow, stage: "remediation" as const, focus: { kind: "problem" as const, section: "approach" as const }, remediationCount: 1, activeGate: gate } };
    const body = await turn(sealSession(session), { type: "choose", gateId: gate.id, choice: "not_understood" });
    const next = event<ClientSessionState>(body, "flow.update");
    expect(next.session.flow.focus.kind).toBe("node");
    expect(next.session.flow.remediationCount).toBe(0);
    expect(next.session.currentNodeId).not.toBe(next.session.rootNodeId);
  });

  it("答错只给检查方向，不在事件中泄露标准答案或原解析", async () => {
    const started = await startState("math", "primary");
    const answerState = event<ClientSessionState>(await turn(started.stateToken, { type: "choose", gateId: started.session.flow.activeGate!.id, choice: "try" }), "flow.update");
    const protectedSession = openSession(answerState.stateToken);
    const check = protectedSession.nodes.find((node) => node.id === protectedSession.flow.activeGate?.nodeId)!.check;
    const wrong = check.choices?.find((choice) => choice !== check.answer) ?? "明显错误";
    const body = await turn(answerState.stateToken, { type: "answer", gateId: answerState.session.flow.activeGate!.id, answer: wrong });
    expect(body).not.toContain(check.explanation);
    expect(body).not.toContain(`正确计算为${check.answer}`);
    expect(body).toMatch(/重新对照条件|重新检查|先检查/);
  });

  it("只能执行当前 Gate 明确提供的选择", async () => {
    const started = await startState("physics", "junior");
    const answerState = event<ClientSessionState>(await turn(started.stateToken, { type: "choose", gateId: started.session.flow.activeGate!.id, choice: "try" }), "flow.update");
    const response = await postTurn(request(answerState.stateToken, { type: "choose", gateId: answerState.session.flow.activeGate!.id, choice: "continue" }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("没有提供这个操作");
  });

  it("完整讲解后先做关键步骤回忆，再明确选择重做同一道原题", async () => {
    const started = await startState("math", "primary");
    const solutionBody = await turn(started.stateToken, { type: "choose", gateId: started.session.flow.activeGate!.id, choice: "full_solution" });
    const afterSolution = event<ClientSessionState>(solutionBody, "flow.update");
    expect(afterSolution.session.flow.viewedSolution).toBe(true);
    expect(afterSolution.session.flow.stage).toBe("solution_recall");
    expect(afterSolution.session.flow.activeGate?.kind).toBe("solution_review");
    expect(afterSolution.session.flow.activeGate?.options?.some((option) => option.id === "view_board")).toBe(true);
    expect(afterSolution.session.originalPassed).toBe(false);

    const boardBody = await turn(afterSolution.stateToken, { type: "choose", gateId: afterSolution.session.flow.activeGate!.id, choice: "view_board" });
    const afterBoard = event<ClientSessionState>(boardBody, "flow.update");
    expect(boardBody).toContain("event: board.lesson");
    expect(afterBoard.session.flow.activeGate?.id).toBe(afterSolution.session.flow.activeGate?.id);

    const reviewDone = event<ClientSessionState>(await turn(afterBoard.stateToken, { type: "choose", gateId: afterBoard.session.flow.activeGate!.id, choice: "start_recall" }), "flow.update");
    expect(reviewDone.session.flow.activeGate?.kind).toBe("solution_recall_answer");
    expect(reviewDone.session.flow.activeGate?.options?.some((option) => option.id === "view_board")).toBe(true);

    const wrongBody = await turn(reviewDone.stateToken, { type: "answer", gateId: reviewDone.session.flow.activeGate!.id, answer: "200" });
    const afterWrong = event<ClientSessionState>(wrongBody, "flow.update");
    expect(afterWrong.session.flow.stage).toBe("solution_recall");
    expect(afterWrong.session.flow.activeGate?.kind).toBe("solution_recall_answer");
    expect(afterWrong.session.originalPassed).toBe(false);

    const retryGate = afterWrong.session.flow.activeGate!;
    expect(retryGate.options?.some((option) => option.id === "full_solution") ?? false).toBe(false);
    const repeatedSolution = await postTurn(request(afterWrong.stateToken, { type: "choose", gateId: retryGate.id, choice: "full_solution" }));
    expect(repeatedSolution.status).toBe(400);
    expect(await repeatedSolution.text()).toContain("完整讲解已经看过了");

    const recallState = await passSolutionRecall(afterWrong);
    expect(recallState.session.flow.activeGate?.kind).toBe("post_solution");
    expect(recallState.session.flow.activeGate?.options?.map((option) => option.id)).toEqual(["retry_original", "practice_similar", "view_board", "finish_review"]);

    const retryBody = await turn(recallState.stateToken, { type: "choose", gateId: recallState.session.flow.activeGate!.id, choice: "retry_original" });
    const retryState = event<ClientSessionState>(retryBody, "flow.update");
    expect(retryState.session.flow.activeGate?.kind).toBe("original_answer");
    expect(retryState.session.flow.activeGate?.title).toContain("刚才的原题");
    expect(retryState.session.flow.activeGate?.options?.map((option) => option.id)).toEqual(["view_board"]);
    const correctBody = await turn(retryState.stateToken, { type: "answer", gateId: retryState.session.flow.activeGate!.id, answer: "300" });
    const complete = event<ClientSessionState>(correctBody, "flow.update");
    expect(complete.session.flow.stage).toBe("complete");
    expect(complete.session.originalPassed).toBe(true);
  });

  it("查看完整讲解调用专用流式解题能力，不复用节点短解释", async () => {
    const detailedSolution = "### 解题思路\n\n先判断题目要求的量，再根据已知条件选择单位量关系。这样做能说明每个数字为什么参与计算，而不是只套一个结果。\n\n### 分步推导\n\n1. 先把总路程平均分到 3 个小时，得到每小时行驶 $180\\div3=60$ 千米。\n2. 5 小时包含 5 个相同的单位时间，所以路程为 $60\\times5=300$ 千米。\n3. 用 $300\\div5=60$ 反向验算，得到的速度与第一步一致。\n\n### 结论\n\n5 小时一共行驶 $300$ 千米。\n\n### 易错提醒\n\n不能直接用 180 乘 5，因为 180 是 3 小时的总路程，不是每小时的路程。";
    const streamSolution = vi.spyOn(MockProviderAdapter.prototype, "streamSolution").mockImplementation(async (_problem, onDelta) => {
      for (const chunk of detailedSolution.match(/.{1,9}/gs) ?? []) onDelta(chunk);
    });
    const started = await startState("math", "primary");
    const root = openSession(started.stateToken).nodes.find((node) => node.id === started.session.rootNodeId)!;
    const body = await turn(started.stateToken, { type: "choose", gateId: started.session.flow.activeGate!.id, choice: "full_solution" });
    const solutionText = eventTexts(body, "message.delta");

    expect(streamSolution).toHaveBeenCalledOnce();
    expect(solutionText).toContain("### 解题思路");
    expect(solutionText).toContain("### 分步推导");
    expect(solutionText).toContain("### 易错提醒");
    expect(solutionText).not.toContain(root.check.explanation);
    expect(event<ClientSessionState>(body, "flow.update").session.flow.activeGate?.kind).toBe("solution_review");
    const names = eventNames(body);
    expect(names.indexOf("message.complete")).toBeLessThan(names.indexOf("flow.update"));
    expect(names.indexOf("flow.update")).toBeLessThan(names.indexOf("complete"));
  });

  it.each([
    ["空响应", ""],
    ["只有半句话", "我来简单讲一下这道题。"],
    ["缺少真实推导", "### 解题思路\n\n先观察条件并选择方法。这里补充足够多的说明文字，但不把决定答案的中间步骤完整展开，因此不应该被系统当成完整讲解。\n\n### 分步推导\n\n只说按公式计算，却没有列出至少两个可跟随步骤。这里继续补充说明文字，以确保失败原因来自结构而非单纯长度。\n\n### 结论\n\n得到结果。\n\n### 易错提醒\n\n注意条件。"],
  ])("完整讲解%s时保留原 Gate，不锁死查看入口", async (_label, output) => {
    vi.spyOn(MockProviderAdapter.prototype, "streamSolution").mockImplementation(async (_problem, onDelta) => { if (output) onDelta(output); });
    const started = await startState("math", "primary");
    const body = await turn(started.stateToken, { type: "choose", gateId: started.session.flow.activeGate!.id, choice: "full_solution" });

    expect(body).toContain("event: error");
    expect(body).not.toContain("event: flow.update");
    expect(body).not.toContain("event: message.complete");
  });

  it("验收模型暂时返回坏结构时保留答案任务，不让学习流中断", async () => {
    enableFailingLiveProvider();
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = base.nodes.find((node) => node.id === base.rootNodeId)!;
    const gate = answerGate("original_answer", "现在独立完成原题", root.check.prompt, root.id, root.check.choices);
    const session = liveSession({ ...base, flow: { ...base.flow, stage: "original_attempt", activeGate: gate } });
    const body = await turn(sealSession(session), { type: "answer", gateId: gate.id, answer: "三百" });
    const next = event<ClientSessionState>(body, "flow.update");
    expect(body).toContain("event: flow.branch_error");
    expect(next.session.flow.activeGate?.id).toBe(gate.id);
    expect(next.session.flow.stage).toBe("original_attempt");
    expect(next.session.originalPassed).toBe(false);
  });

  it("知识检查卡明确提供完整讲解时可以查看，但先进入关键步骤回忆", async () => {
    const started = await startState("physics", "junior");
    const answerState = event<ClientSessionState>(await turn(started.stateToken, { type: "choose", gateId: started.session.flow.activeGate!.id, choice: "try" }), "flow.update");
    expect(answerState.session.flow.activeGate?.kind).toBe("node_answer");
    expect(answerState.session.flow.activeGate?.options?.some((option) => option.id === "full_solution")).toBe(true);
    const afterSolution = event<ClientSessionState>(await turn(answerState.stateToken, { type: "choose", gateId: answerState.session.flow.activeGate!.id, choice: "full_solution" }), "flow.update");
    expect(afterSolution.session.flow.stage).toBe("solution_recall");
    expect(afterSolution.session.flow.activeGate?.kind).toBe("solution_review");
    expect(afterSolution.session.originalPassed).toBe(false);
  });

  it("原题完成后迁移题可选且不阻塞完成", async () => {
    const started = await startState("math", "primary");
    const solution = event<ClientSessionState>(await turn(started.stateToken, { type: "choose", gateId: started.session.flow.activeGate!.id, choice: "full_solution" }), "flow.update");
    const recalled = await passSolutionRecall(solution);
    const original = event<ClientSessionState>(await turn(recalled.stateToken, { type: "choose", gateId: recalled.session.flow.activeGate!.id, choice: "retry_original" }), "flow.update");
    const complete = event<ClientSessionState>(await turn(original.stateToken, { type: "answer", gateId: original.session.flow.activeGate!.id, answer: "300" }), "flow.update");
    expect(complete.session.flow.stage).toBe("complete");
    expect(complete.session.flow.activeGate).toBeNull();
    expect(complete.session.transferCheck).toBeNull();

    const transfer = event<ClientSessionState>(await turn(complete.stateToken, { type: "request_transfer" }), "flow.update");
    expect(transfer.session.flow.stage).toBe("complete");
    expect(transfer.session.flow.activeGate?.kind).toBe("transfer_answer");
    expect(transfer.session.transferCheck?.prompt).toBeTruthy();
    expect(transfer.session.transferCheck?.answer).toBe("");

    const repeated = event<ClientSessionState>(await turn(transfer.stateToken, { type: "request_transfer" }), "flow.update");
    expect(repeated.session.transferCheck?.id).toBe(transfer.session.transferCheck?.id);
    expect(repeated.session.flow.activeGate?.id).toBe(transfer.session.flow.activeGate?.id);

    const hidden = openSession(transfer.stateToken);
    const passed = event<ClientSessionState>(await turn(transfer.stateToken, { type: "answer", gateId: transfer.session.flow.activeGate!.id, answer: hidden.transferCheck!.answer }), "flow.update");
    const fresh = event<ClientSessionState>(await turn(passed.stateToken, { type: "request_transfer" }), "flow.update");
    expect(fresh.session.transferCheck?.id).not.toBe(transfer.session.transferCheck?.id);

    const bypass = await postTurn(request(transfer.stateToken, { type: "choose", gateId: transfer.session.flow.activeGate!.id, choice: "full_solution" }));
    expect(bypass.status).toBe(400);
  });

  it("关键步骤通过后可改做同知识点题，并以独立答对形成掌握证据", async () => {
    const started = await startState("physics", "junior");
    const solution = event<ClientSessionState>(await turn(started.stateToken, { type: "choose", gateId: started.session.flow.activeGate!.id, choice: "full_solution" }), "flow.update");
    const recalled = await passSolutionRecall(solution);
    const transfer = event<ClientSessionState>(await turn(recalled.stateToken, { type: "choose", gateId: recalled.session.flow.activeGate!.id, choice: "practice_similar" }), "flow.update");
    expect(transfer.session.flow.activeGate?.kind).toBe("transfer_answer");
    expect(transfer.session.originalPassed).toBe(false);

    const hidden = openSession(transfer.stateToken);
    const complete = event<ClientSessionState>(await turn(transfer.stateToken, { type: "answer", gateId: transfer.session.flow.activeGate!.id, answer: hidden.transferCheck!.answer }), "flow.update");
    expect(complete.session.flow.stage).toBe("complete");
    expect(complete.session.transferPassed).toBe(true);
    expect(complete.session.originalPassed).toBe(false);
    expect(complete.session.nodes.find((node) => node.id === complete.session.rootNodeId)?.state).toBe("mastered");
    expect(complete.session.evidence.some((item) => item.nodeId === complete.session.rootNodeId && item.passed)).toBe(true);
  });

  it("关键步骤通过后可以先结束，且稍后仍能明确重做原题", async () => {
    const started = await startState("chemistry", "junior");
    const solution = event<ClientSessionState>(await turn(started.stateToken, { type: "choose", gateId: started.session.flow.activeGate!.id, choice: "full_solution" }), "flow.update");
    const recalled = await passSolutionRecall(solution);
    const reviewed = event<ClientSessionState>(await turn(recalled.stateToken, { type: "choose", gateId: recalled.session.flow.activeGate!.id, choice: "finish_review" }), "flow.update");
    expect(reviewed.session.flow.stage).toBe("reviewed_complete");
    expect(reviewed.session.stage).toBe("reviewed");
    expect(reviewed.session.currentNodeId).toBeNull();
    expect(reviewed.session.flow.activeGate).toBeNull();
    expect(reviewed.session.originalPassed).toBe(false);

    const retried = event<ClientSessionState>(await turn(reviewed.stateToken, { type: "retry_original" }), "flow.update");
    expect(retried.session.flow.stage).toBe("original_attempt");
    expect(retried.session.flow.activeGate?.title).toContain("刚才的原题");
  });

  it("迁移题生成失败不撤销原题已完成状态", async () => {
    enableFailingLiveProvider();
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const session = liveSession({ ...base, originalPassed: true, stage: "transfer_check", currentNodeId: null, flow: { ...base.flow, stage: "complete", activeGate: null } });
    const body = await turn(sealSession(session), { type: "request_transfer" });
    const next = event<ClientSessionState>(body, "flow.update");
    expect(body).toContain("event: flow.branch_error");
    expect(next.session.originalPassed).toBe(true);
    expect(next.session.flow.stage).toBe("complete");
    expect(next.session.flow.activeGate).toBeNull();
  });

  it("拒绝使用旧互动 ID 绕过当前任务", async () => {
    const started = await startState("chemistry", "junior");
    const response = await postTurn(request(started.stateToken, { type: "choose", gateId: "stale-gate", choice: "continue" }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("当前学习任务已变化");
  });
});

async function startState(subject: "math" | "physics" | "chemistry", gradeBand: "primary" | "junior" | "senior") {
  const session = analyzeMock(recognizeMock(subject, gradeBand), "doubao");
  return event<ClientSessionState>(await turn(sealSession(session), { type: "start" }), "flow.update");
}

async function passSolutionRecall(state: ClientSessionState) {
  const recallState = state.session.flow.activeGate?.kind === "solution_review"
    ? event<ClientSessionState>(await turn(state.stateToken, { type: "choose", gateId: state.session.flow.activeGate.id, choice: "start_recall" }), "flow.update")
    : state;
  const hidden = openSession(recallState.stateToken);
  return event<ClientSessionState>(await turn(recallState.stateToken, {
    type: "answer",
    gateId: recallState.session.flow.activeGate!.id,
    answer: hidden.problemGuide.approach,
  }), "flow.update");
}

async function turn(stateToken: string, input: LearningTurnInput) {
  const response = await postTurn(request(stateToken, input));
  expect(response.status).toBe(200);
  return response.text();
}

function request(stateToken: string, input: LearningTurnInput, signal?: AbortSignal) {
  return new Request("http://localhost/api/learning/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `test-turn-${requestIndex += 1}` },
    body: JSON.stringify({ stateToken, input }),
    signal,
  });
}

function imageRequest(stateToken: string, input: LearningTurnInput) {
  const form = new FormData();
  form.set("stateToken", stateToken);
  form.set("input", JSON.stringify(input));
  form.set("image", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "answer.png", { type: "image/png" }));
  return new Request("http://localhost/api/learning/turn", {
    method: "POST",
    headers: { "x-forwarded-for": `test-turn-${requestIndex += 1}` },
    body: form,
  });
}

function event<T>(body: string, eventName: string): T {
  const blocks = body.split("\n\n").filter((item) => item.includes(`event: ${eventName}`));
  const raw = blocks.at(-1)?.match(/^data: (.+)$/m)?.[1];
  if (!raw) throw new Error(`缺少 SSE 事件：${eventName}`);
  return JSON.parse(raw) as T;
}

function eventTexts(body: string, eventName: string): string {
  return body.split("\n\n")
    .filter((item) => item.includes(`event: ${eventName}`))
    .map((item) => item.match(/^data: (.+)$/m)?.[1])
    .filter((item): item is string => Boolean(item))
    .map((item) => String((JSON.parse(item) as { text?: string }).text ?? ""))
    .join("");
}

function eventNames(body: string): string[] {
  return body.split("\n\n").map((item) => item.match(/^event: (.+)$/m)?.[1]).filter((item): item is string => Boolean(item));
}

function enableFailingLiveProvider() {
  vi.stubEnv("AI_MOCK_MODE", "false");
  vi.stubEnv("DOUBAO_API_KEY", "test-key");
  vi.stubEnv("DOUBAO_MODEL_ID", "test-model");
  vi.stubGlobal("fetch", async () => { throw new Error("optional provider unavailable"); });
}

function liveSession<T extends ReturnType<typeof analyzeMock>>(session: T): T {
  return { ...session, mode: "live", modelId: "test-model" };
}
