// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KnowledgeExplanation } from "@/components/knowledge-explanation";
import { UiLanguageProvider, UiLanguageSwitch } from "@/components/ui-language";
import type { ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";
import { knowledgeDetailIdentity } from "@/lib/learning/knowledge-detail-context";

vi.mock("@/components/lazy-rich-learning-text", () => ({ RichLearningText: ({ text }: { text: string }) => <p>{text}</p> }));
const focus = { id: "area", title: "长方形面积", summary: "已有概述", application: "已有应用", evidence: "长8厘米，宽3厘米" };
const map: ProblemKnowledgeMap = { version: 1, overviewOnly: true, rootId: focus.id, nodes: [focus], edges: [] };
const props = { focus, map, stateToken: "test-token", cacheKey: "test-question", partial: true };
const detail = { summary: "面积表示平面的大小。", application: "用原题的长乘宽。" };
const response = (value: unknown = detail, ok = true) => new Response(ok ? `event: complete\ndata: ${JSON.stringify({ detail: value })}\n\n` : "{}", { status: ok ? 200 : 503, headers: { "Content-Type": ok ? "text/event-stream" : "application/json" } });
function deferred() { let resolve!: (value: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { resolve, promise }; }
beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("第一段完整到达即展示，第二段仍等待；中断撤回未完成预览且不写缓存", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  vi.mocked(fetch).mockResolvedValue(new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { "Content-Type": "text/event-stream" } }));
  render(<KnowledgeExplanation {...props}/>);
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const send = (event: string, data: unknown) => controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  await act(async () => { send("detail.summary", { summary: "先生成的完整说明" }); });
  expect(screen.getByText("先生成的完整说明")).toBeTruthy();
  expect(screen.getByRole("region", { name: "本题怎么用" }).getAttribute("aria-busy")).toBe("true");
  expect(document.querySelectorAll(".knowledge-detail-skeleton")).toHaveLength(1);
  expect(localStorage.getItem("test-question:detail:area")).toBeNull();
  await act(async () => { controller.close(); });
  expect(screen.queryByText("先生成的完整说明")).toBeNull();
  expect(screen.getByRole("button", { name: "重试说明" })).toBeTruthy();
  expect(localStorage.getItem("test-question:detail:area")).toBeNull();
});

it("即刻明确展示两个待生成区，完整响应原位替换，不伪造部分进度", async () => {
  const request = deferred(); vi.mocked(fetch).mockReturnValue(request.promise);
  render(<KnowledgeExplanation {...props}/>);
  expect(screen.getByRole("status", { name: "知识讲解" }).textContent).toBe("正在整理知识讲解");
  const summary = screen.getByRole("region", { name: "它是什么" });
  const application = screen.getByRole("region", { name: "本题怎么用" });
  expect(summary.getAttribute("aria-busy")).toBe("true");
  expect(application.getAttribute("aria-busy")).toBe("true");
  expect(document.querySelectorAll(".knowledge-detail-skeleton")).toHaveLength(2);
  expect(screen.queryByText("已有概述")).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await act(async () => { request.resolve(response()); });
  expect(await screen.findByText(detail.summary)).toBeTruthy();
  expect(screen.getByText(detail.application)).toBeTruthy();
  expect(screen.getByRole("region", { name: "它是什么" })).toBe(summary);
  expect(screen.getByRole("region", { name: "本题怎么用" })).toBe(application);
  expect(summary.getAttribute("aria-busy")).toBe("false");
  expect(document.querySelectorAll(".knowledge-detail-skeleton,.knowledge-detail-spinner")).toHaveLength(0);
  expect(screen.getByRole("status", { name: "知识讲解" }).textContent).toBe("知识讲解已就绪");
});

it("已经有说明时保留正文，不以骨架盖住；失败也不丢内容", async () => {
  const request = deferred(); vi.mocked(fetch).mockReturnValue(request.promise);
  render(<KnowledgeExplanation {...props} map={{ ...map, overviewOnly: false }}/>);
  expect(screen.getByText(focus.summary)).toBeTruthy();
  expect(screen.getByText(focus.application)).toBeTruthy();
  expect(document.querySelector(".knowledge-detail-skeleton")).toBeNull();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await act(async () => { request.resolve(response(null, false)); });
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByText(focus.summary)).toBeTruthy();
});

it("失败停止动画，原区域显示失败，只有手动重试才恢复骨架并重新请求", async () => {
  const retry = deferred();
  vi.mocked(fetch).mockResolvedValueOnce(response({ summary: "缺少使用方式" })).mockReturnValueOnce(retry.promise);
  render(<KnowledgeExplanation {...props}/>);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("补充说明暂未加载"));
  expect(document.querySelectorAll(".knowledge-detail-skeleton,.knowledge-detail-spinner")).toHaveLength(0);
  expect(screen.getAllByText("等待重试补充")).toHaveLength(2);
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "重试说明" }));
  expect(document.querySelectorAll(".knowledge-detail-skeleton")).toHaveLength(2);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await act(async () => { retry.resolve(response()); });
  expect(await screen.findByText(detail.summary)).toBeTruthy();
});

it("切换知识点取消旧请求，迟到内容不串到新卡片", async () => {
  const old = deferred(), current = deferred();
  vi.mocked(fetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const view = render(<KnowledgeExplanation key="area" {...props}/>);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const oldSignal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
  view.rerender(<KnowledgeExplanation key="perimeter" {...props} focus={{ ...focus, id: "perimeter" }} map={{ ...map, nodes: [...map.nodes, { ...focus, id: "perimeter" }] }}/>);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => { old.resolve(response({ summary: "旧说明", application: "旧用法" })); });
  expect(screen.queryByText("旧说明")).toBeNull();
  await act(async () => { current.resolve(response({ summary: "新说明", application: "新用法" })); });
  expect(await screen.findByText("新说明")).toBeTruthy();
  expect(localStorage.getItem("test-question:detail:area")).toBeNull();
});

it("合法缓存直接恢复，后续图谱节点到达不重复请求或重置说明", async () => {
  localStorage.setItem("test-question:detail:area", JSON.stringify({ identity: knowledgeDetailIdentity(map, focus.id), detail }));
  const view = render(<KnowledgeExplanation {...props}/>);
  expect(await screen.findByText(detail.summary)).toBeTruthy();
  view.rerender(<KnowledgeExplanation {...props} partial={false} map={{ ...map, nodes: [...map.nodes, { ...focus, id: "new" }] }}/>);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText(detail.application)).toBeTruthy();
});

it("关闭后无关节点继续生成，重新打开原节点命中完整缓存；相关条件变更则重取", async () => {
  localStorage.setItem("test-question:detail:area", JSON.stringify({ identity: knowledgeDetailIdentity(map, focus.id), detail }));
  const grownMap = { ...map, nodes: [...map.nodes, { ...focus, id: "other", title: "另一个知识点" }] };
  const view = render(<KnowledgeExplanation {...props} map={grownMap}/>);
  expect(await screen.findByText(detail.summary)).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  view.unmount();
  vi.mocked(fetch).mockResolvedValue(response());
  render(<KnowledgeExplanation {...props} map={{ ...grownMap, edges: [{ from: focus.id, to: "other", kind: "prerequisite", reason: "新增了与当前点有关的条件" }] }}/>);
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
});

it("新题即使知识点同名也不复用旧题详情", async () => {
  localStorage.setItem("test-question:detail:area", JSON.stringify({ identity: knowledgeDetailIdentity(map, focus.id), detail }));
  vi.mocked(fetch).mockResolvedValue(response({ summary: "新题说明", application: "新题使用" }));
  render(<KnowledgeExplanation {...props} cacheKey="new-question"/>);
  expect(await screen.findByText("新题说明")).toBeTruthy();
  expect(screen.queryByText(detail.summary)).toBeNull();
});

it.each(["说明 $x", "面积 rac{1}{2}"])("损坏的已缓存说明不能重新展示：%s", summary => {
  localStorage.setItem("test-question:detail:area", JSON.stringify({ identity: knowledgeDetailIdentity(map, focus.id), detail: { ...detail, summary } }));
  vi.mocked(fetch).mockResolvedValue(response());
  render(<KnowledgeExplanation {...props}/>);
  return waitFor(() => {
    expect(fetch).toHaveBeenCalledOnce();
    expect(screen.queryByText(summary)).toBeNull();
    expect(screen.getByText(detail.summary)).toBeTruthy();
  });
});

it("30秒超时进入可重试失败态，不无限展示骨架", async () => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => { const controller = new AbortController(); setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), ms); return controller.signal; });
  vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason), { once: true })));
  render(<KnowledgeExplanation {...props}/>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(AbortSignal.timeout).toHaveBeenCalledWith(30000);
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(screen.getByRole("button", { name: "重试说明" })).toBeTruthy();
  expect(document.querySelector(".knowledge-detail-skeleton")).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("英文只切换加载界面文案，不改写模型正文", async () => {
  const request = deferred(); vi.mocked(fetch).mockReturnValue(request.promise);
  render(<UiLanguageProvider><UiLanguageSwitch/><KnowledgeExplanation {...props}/></UiLanguageProvider>);
  fireEvent.click(screen.getByRole("button", { name: "English interface" }));
  expect(screen.getByText("Preparing the concept explanation").closest('[role="status"]')).toBeTruthy();
  expect(screen.getByRole("heading", { name: "What it means" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "How it applies" })).toBeTruthy();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await act(async () => { request.resolve(response()); });
  expect(await screen.findByText(detail.summary)).toBeTruthy();
});
