import { describe, expect, it } from "vitest";
import { restoreChatRetry } from "@/lib/learning/chat-retry";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { understandingGate } from "@/lib/learning/flow";
import type { ChatMessage, ClientSessionState } from "@/lib/learning/types";

const messages: ChatMessage[] = [{ id: "failed", role: "assistant", kind: "assistant", text: "未完成的讲解", status: "error", createdAt: "2026-09-06T00:00:00Z" }];
function state(started = false): ClientSessionState {
  const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
  session.flow = { ...session.flow, stage: started ? "core_explanation" : "intake", activeGate: started ? understandingGate() : null };
  return { session, stateToken: "token-original" };
}
function record(current: ClientSessionState, input: unknown = { type: "question", text: "为什么？", quote: "原话" }) {
  return { version: 1, requestId: current.session.requestId, stateToken: current.stateToken, messageId: "failed", input };
}
describe("失败请求刷新恢复", () => {
  it("兼容旧版首次讲解失败，不需要从未完成正文猜问题", () => {
    expect(restoreChatRetry(undefined, state(), messages)?.input).toEqual({ type: "start" });
  });
  it("兼容首次讲解输出中刷新", () => {
    expect(restoreChatRetry(undefined, state(), [{ ...messages[0], status: "streaming" }])?.input).toEqual({ type: "start" });
  });
  it("已经成功的旧讲解不能再推断为失败", () => {
    expect(restoreChatRetry(undefined, state(), [{ ...messages[0], status: "complete" }])).toBeNull();
  });
  it("恢复问题、选中文字和原始状态", () => {
    const current = state(true), saved = record(current);
    expect(restoreChatRetry(saved, current, messages)).toEqual(saved);
  });
  it("恢复按钮操作，不把它降级为自由提问", () => {
    const current = state(true), saved = record(current, { type: "choose", gateId: current.session.flow.activeGate!.id, choice: "full_solution" });
    expect(restoreChatRetry(saved, current, messages)).toEqual(saved);
  });
  it("不恢复其他题、已推进状态或被后来问题取代的请求", () => {
    const current = state(true), saved = record(current);
    expect(restoreChatRetry({ ...saved, requestId: "other" }, current, messages)).toBeNull();
    expect(restoreChatRetry({ ...saved, stateToken: "advanced" }, current, messages)).toBeNull();
    expect(restoreChatRetry(saved, current, [...messages, { ...messages[0], id: "new-user", role: "user" }])).toBeNull();
  });
  it("旧版任意问答不猜测重放内容", () => {
    expect(restoreChatRetry(undefined, state(true), messages)).toBeNull();
  });
  it("需要原图时不静默丢弃原图进行重试", () => {
    const current = state();
    current.session.problem.visualContext = { related: true, affectsSolving: true, summary: "几何图", facts: [], confidence: 1 };
    expect(restoreChatRetry(undefined, current, messages)).toBeNull();
    expect(restoreChatRetry(record(current, { type: "start" }), current, messages)).toBeNull();
    expect(restoreChatRetry(record(state(true), { type: "image_question" }), state(true), messages)).toBeNull();
  });
  it.each([null, {}, { type: "question", text: "" }, { type: "choose", gateId: "wrong", choice: "continue" }, { type: "delete_all" }])("拒绝损坏或无效操作：%j", (input) => {
    const current = state(true);
    expect(restoreChatRetry(record(current, input), current, messages)).toBeNull();
  });
});
