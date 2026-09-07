// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useKnowledgeConnections } from "@/components/use-knowledge-connections";
import type { ChatMessage, LearningSession } from "@/lib/learning/types";
import { connection, source, evidence } from "./fixtures/knowledge-connection";
const session = { requestId: "lesson", problem: { text: evidence }, nodes: [], edges: [] } as unknown as LearningSession;
const message = { id: "m", role: "assistant", kind: "assistant", status: "complete", text: source } as ChatMessage;
const success = (id = "m", value: unknown = connection) => Response.json({ messageId: id, connection: value });
const defaults = { session, token: "signed", messages: [message], enabled: true, locked: false };
const useTestConnections = (p: typeof defaults) => useKnowledgeConnections(p.session, p.token, p.messages, p.enabled, p.locked);
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(success())));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("零节点和口语讲解触发；正文完成前不发起请求；令牌刷新不重复生成", async () => {
  const view = renderHook(useTestConnections, { initialProps: { ...defaults, enabled: false } });
  expect(fetch).not.toHaveBeenCalled();
  view.rerender(defaults);
  await waitFor(() => expect(view.result.current.entries.get("m")?.status).toBe("ready"));
  expect(view.result.current.entries.get("m")?.connection).toEqual(connection);
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(body).toEqual({ stateToken: "signed", messageId: "m", source });
  view.rerender({ ...defaults, token: "refreshed" });
  await act(() => new Promise(resolve => setTimeout(resolve, 10)));
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("失败可只重试连接，已完成讲解不重置", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("network"));
  const view = renderHook(useTestConnections, { initialProps: defaults });
  await waitFor(() => expect(view.result.current.entries.get("m")?.status).toBe("error"));
  act(() => view.result.current.retry());
  await waitFor(() => expect(view.result.current.entries.get("m")?.status).toBe("ready"));
  expect(message.status).toBe("complete");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("切换题目取消请求，旧响应不能挂到新题", async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = renderHook(useTestConnections, { initialProps: defaults });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
  view.rerender({ ...defaults, session: { ...session, requestId: "new" }, messages: [] });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(success()));
  expect(view.result.current.entries.size).toBe(0);
});
it("开始下一步或收起答案时取消补充请求且不会泄露连接", async () => {
  vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
  const view = renderHook(useTestConnections, { initialProps: defaults });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
  view.rerender({ ...defaults, enabled: false, locked: true });
  expect(signal.aborted).toBe(true); expect(view.result.current.entries.size).toBe(0);
});
it("不展示的决定不会循环请求；串消息的响应不能展示", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(success("m", null));
  const view = renderHook(useTestConnections, { initialProps: defaults });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await act(() => new Promise(resolve => setTimeout(resolve, 10)));
  expect(view.result.current.entries.size).toBe(0);
  view.rerender({ ...defaults, token: "new" });
  await act(() => new Promise(resolve => setTimeout(resolve, 10)));
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.mocked(fetch).mockResolvedValue(success("wrong"));
  view.rerender({ ...defaults, messages: [{ ...message, id: "other" }] });
  await waitFor(() => expect(view.result.current.entries.get("other")?.status).toBe("error"));
});
