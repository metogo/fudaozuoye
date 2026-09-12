import { afterEach, expect, it, vi } from "vitest";
import { postTurn } from "../lib/learning/http/turn";
import { MockProviderAdapter } from "../lib/learning/providers/mock-adapter";
import type { ProviderAdapter } from "../lib/learning/providers/provider-contract";
import type { LearningSession } from "../lib/learning/types";
import { recognizeMock, analyzeMock } from "../lib/learning/mock-engine";
import { sealSession } from "../lib/learning/server-state";

afterEach(() => vi.restoreAllMocks());
const visual = { related: true, affectsSolving: true, summary: "三角形边长", confidence: 1, facts: [{ text: "AC为3厘米", source: "printed_label" as const, confidence: 1 }] };

it.each(["primary", "junior", "senior"] as const)("%s文字题首字之前不竞争完整求解，首字后只启动一次", async band => {
  const mock = new MockProviderAdapter("doubao");
  const pending = await mock.prepareChatSession(recognizeMock("math", band));
  const preparation = vi.spyOn(MockProviderAdapter.prototype, "completeChatSession");
  vi.spyOn(MockProviderAdapter.prototype, "streamTutorReply").mockImplementation(async (_session, _scope, _question, emit) => {
    expect(preparation).not.toHaveBeenCalled();
    emit("先找到要求的量。");
    expect(preparation).toHaveBeenCalledTimes(1);
    emit("再看已知条件如何联系起来。");
    expect(preparation).toHaveBeenCalledTimes(1);
  });
  const response = await postTurn(new Request("http://localhost/api/learning/turn", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `priority-${band}` }, body: JSON.stringify({ stateToken: sealSession(pending), input: { type: "start" } }) }));
  const body = await response.text();
  expect(body).toContain("event: flow.ready");
  expect(body).not.toContain("event: error");
  expect(preparation).toHaveBeenCalledTimes(1);
});

it("文字首讲在首字前失败时不启动无用的后台求解", async () => {
  const mock = new MockProviderAdapter("doubao");
  const pending = await mock.prepareChatSession(recognizeMock("english", "primary"));
  const preparation = vi.spyOn(MockProviderAdapter.prototype, "completeChatSession");
  vi.spyOn(MockProviderAdapter.prototype, "streamTutorReply").mockRejectedValue(new Error("模型暂时不可用"));
  const response = await postTurn(new Request("http://localhost/api/learning/turn", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "priority-failed" }, body: JSON.stringify({ stateToken: sealSession(pending), input: { type: "start" } }) }));
  expect(await response.text()).toContain("event: error");
  expect(preparation).not.toHaveBeenCalled();
});

it.each(["success", "failed"] as const)("证据核验后先显示正文，完整分析%s前不发完成和学习状态", async status => {
  const mock = new MockProviderAdapter("doubao");
  const pending = await mock.prepareChatSession({ ...recognizeMock("math", "primary"), visualContext: visual });
  let resolve!: (session: LearningSession) => void, reject!: (error: Error) => void;
  const prototype = MockProviderAdapter.prototype as ProviderAdapter;
  const preparation = vi.spyOn(prototype, "completeChatSession").mockImplementation((_session, image, onVisual) => {
    expect(image).toContain("data:image/png;base64");
    onVisual!(visual);
    return new Promise((yes, no) => { resolve = yes; reject = no; });
  });
  const tutor = vi.spyOn(prototype, "streamTutorReply").mockImplementation(async (session, _scope, _question, emit) => {
    expect(session.problem.visualContext?.facts).toEqual(visual.facts);
    emit("已经核验图中边长，请先找到直角对应的斜边。");
  });
  const cancel = vi.spyOn(prototype, "cancelPendingRequests");
  const form = new FormData();
  form.set("stateToken", sealSession(pending));
  form.set("input", JSON.stringify({ type: "start" }));
  form.set("image", new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], "test.png", { type: "image/png" }));
  const response = await postTurn(new Request("http://localhost/api/learning/turn", { method: "POST", headers: { "x-forwarded-for": `visual-first-${status}` }, body: form }));
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  let body = "";
  while (!body.includes("已经核验图中边长")) { const chunk = await reader.read(); expect(chunk.done).toBe(false); body += decoder.decode(chunk.value); }
  expect(tutor).toHaveBeenCalledTimes(1);
  expect(preparation).toHaveBeenCalledTimes(1);
  expect(body).not.toContain("event: message.complete");
  expect(body).not.toContain("event: flow.update");
  if (status === "success") resolve(analyzeMock(pending.problem, "doubao"));
  else reject(new Error("题图复核前后不一致，请重新分析"));
  for (;;) { const { done, value } = await reader.read(); if (done) break; body += decoder.decode(value); }
  reader.releaseLock();
  if (status === "success") {
    expect(body).toContain("event: message.complete");
    expect(body).toContain("event: flow.ready");
    expect(body).not.toContain("event: error");
  } else {
    expect(body).toContain("event: error");
    expect(body).not.toContain("event: message.complete");
    expect(body).not.toContain("event: flow.update");
    expect(cancel).toHaveBeenCalled();
  }
});

it("核验未通过时不允许先讲或发布学习状态", async () => {
  const { prepareFirstTurn } = await import("../lib/learning/first-turn-preparation");
  const mock = new MockProviderAdapter("doubao");
  const pending = await mock.prepareChatSession(recognizeMock("math", "primary"));
  vi.spyOn(mock, "completeChatSession").mockRejectedValue(new Error("图中条件仍不清楚"));
  const state = prepareFirstTurn(pending, mock, "data:image/png;base64,test");
  await expect(state.ready).rejects.toThrow("仍不清楚");
  expect((await state.completion).ok).toBe(false);
});

it("适配器未提前输出时，残缺标准答案仍拒绝且不会无限等待", async () => {
  const { prepareFirstTurn } = await import("../lib/learning/first-turn-preparation");
  const mock = new MockProviderAdapter("doubao");
  const pending = await mock.prepareChatSession(recognizeMock("math", "primary"));
  vi.spyOn(mock, "completeChatSession").mockResolvedValue(pending);
  const state = prepareFirstTurn(pending, mock, "data:image/png;base64,test");
  await expect(state.ready).rejects.toThrow("尚未准备完成");
  expect((await state.completion).ok).toBe(false);
});
