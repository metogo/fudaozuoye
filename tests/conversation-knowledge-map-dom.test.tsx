// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, LearningSession } from "@/lib/learning/types";
import { ConversationKnowledgeMap } from "@/components/conversation-knowledge-map";
import { UiLanguageProvider } from "@/components/ui-language";
import { UI_LOCALE_KEY } from "@/lib/ui-copy";
vi.mock("@/components/problem-knowledge-map", () => ({ KnowledgeMapDialog: ({ onClose, generation }: { onClose: () => void; generation: { map: { nodes: unknown[] } | null } }) => <div role="dialog">节点 {generation.map?.nodes.length ?? 0}<button onClick={onClose}>关闭全图</button></div> }));

const session = { requestId: "inline-one", problem: { text: "长方形长8厘米，宽3厘米，求周长。" } } as LearningSession;
const nodes = [
  { id: "root", title: "长方形周长", summary: "", application: "", evidence: "求周长" },
  { id: "length", title: "长与宽", summary: "", application: "", evidence: "长8厘米，宽3厘米" },
];
const edges = [{ from: "root", to: "length", kind: "prerequisite", reason: "求周长需要长与宽。" }];
const plan = { rootId: "root", nodes: [{ id: "root", parents: [] }, { id: "length", parents: ["root"] }] };
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const nodeFrame = (index: number) => frame("map.node", { type: "node", node: nodes[index], edges: index ? edges : [] });
const content = frame("map.plan", { type: "plan", plan }) + nodeFrame(0) + nodeFrame(1) + frame("complete", { total: 2 });
const response = () => new Response(content, { headers: { "Content-Type": "text/event-stream" } });
const base = { session, stateToken: "token", open: false, onOpen: vi.fn(), onClose: vi.fn() };

describe("对话前置图谱", () => {
  beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response())); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it("无需点击即生成，完整缓存包含节点和连线，未打开全图也保存", async () => {
    render(<ConversationKnowledgeMap {...base}/>);
    expect(screen.getByRole("region", { name: "本题知识脉络" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("正在找出核心知识…")).toBeNull();
    await screen.findByText("已全部生成");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({ stateToken: "token", stream: true, earlyRoot: true });
    expect(document.querySelectorAll("[data-knowledge-id]")).toHaveLength(2);
    expect(document.querySelectorAll("[data-map-edge]")).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "知识节点与连线" })).toBeNull();
    expect(JSON.parse(localStorage.getItem("problem-knowledge-map-v2:inline-one")!).map.edges).toHaveLength(1);
  });
  it("根节点先到时不冒充完整图谱，按真实消息增加节点，完成前不缓存", async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(fetch).mockResolvedValue(new Response(new ReadableStream({ start(c) { stream = c; } }), { headers: { "Content-Type": "text/event-stream" } }));
    render(<ConversationKnowledgeMap {...base}/>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const send = async (data: string) => act(async () => { stream.enqueue(new TextEncoder().encode(data)); });
    await send(frame("map.root", { node: nodes[0] }));
    expect(screen.getByText("核心知识已识别，正在梳理关联")).not.toBeNull();
    expect(screen.queryByText("已全部生成")).toBeNull();
    await send(frame("map.plan", { type: "plan", plan }) + nodeFrame(0));
    expect(screen.getByText("已生成 1 / 2 个知识点")).not.toBeNull();
    expect(localStorage.getItem("problem-knowledge-map-v2:inline-one")).toBeNull();
    await send(nodeFrame(1) + frame("complete", { total: 2 }));
    expect(screen.getByText("已全部生成")).not.toBeNull();
  });
  it("打开全图和返回、token 随对话更新不重复生成，文字知识点可直接打开", async () => {
    const view = render(<ConversationKnowledgeMap {...base}/>);
    await screen.findByText("已全部生成");
    fireEvent.click(screen.getByRole("button", { name: "查看知识点：长与宽" }));
    expect(base.onOpen).toHaveBeenCalledWith({ id: "length", title: "长与宽" });
    view.rerender(<ConversationKnowledgeMap {...base} open stateToken="updated-token"/>);
    await screen.findByRole("dialog");
    expect(screen.getByText("节点 2")).not.toBeNull();
    fireEvent.click(screen.getByText("关闭全图"));
    expect(base.onClose).toHaveBeenCalledTimes(1);
    view.rerender(<ConversationKnowledgeMap {...base} stateToken="updated-token"/>);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("全图打开和关闭不取消仍在输出的同一条流", async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(fetch).mockResolvedValue(new Response(new ReadableStream({ start(c) { stream = c; } }), { headers: { "Content-Type": "text/event-stream" } }));
    const view = render(<ConversationKnowledgeMap {...base}/>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    view.rerender(<ConversationKnowledgeMap {...base} open/>);
    await screen.findByRole("dialog");
    view.rerender(<ConversationKnowledgeMap {...base}/>);
    await act(async () => { stream.enqueue(new TextEncoder().encode(content)); });
    expect(screen.getByText("已全部生成")).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("新题卸载取消请求；切换题目使用新 token，不混入旧题缓存", async () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}));
    const view = render(<ConversationKnowledgeMap key="one" {...base}/>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    view.rerender(<ConversationKnowledgeMap key="two" {...base} session={{ ...session, requestId: "inline-two" }} stateToken="two"/>);
    await screen.findByText("已全部生成");
    expect(signal.aborted).toBe(true);
    expect(localStorage.getItem("problem-knowledge-map-v2:inline-one")).toBeNull();
    expect(localStorage.getItem("problem-knowledge-map-v2:inline-two")).not.toBeNull();
  });
  it("生成失败显示独立重试，失败的半图不存为成功缓存", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(frame("map.plan", { type: "plan", plan }) + nodeFrame(0), { headers: { "Content-Type": "text/event-stream" } }));
    render(<ConversationKnowledgeMap {...base}/>);
    await screen.findByText("生成暂时中断");
    expect(document.querySelectorAll("[data-knowledge-id]")).toHaveLength(1);
    expect(localStorage.getItem("problem-knowledge-map-v2:inline-one")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试生成" }));
    await screen.findByText("已全部生成");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("刷新恢复完整缓存，不调用模型，不覆盖已保存布局", async () => {
    const cached = { identity: JSON.stringify(session.problem), map: { version: 1, overviewOnly: true, rootId: "root", nodes, edges }, positions: { root: { x: 12, y: 20 } } };
    localStorage.setItem("problem-knowledge-map-v2:inline-one", JSON.stringify(cached));
    render(<ConversationKnowledgeMap {...base}/>);
    await screen.findByText("已全部生成");
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("problem-knowledge-map-v2:inline-one")!).positions).toEqual(cached.positions);
  });
  it("StrictMode 重挂载只发一次请求", async () => {
    render(<StrictMode><ConversationKnowledgeMap {...base}/></StrictMode>);
    await screen.findByText("已全部生成");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("复杂图谱只展示三个关键词，完整节点和连线仍保留在全图", async () => {
    const extra = Array.from({ length: 7 }, (_, i) => ({ ...nodes[1], id: `extra-${i}`, title: `关联知识${i}` }));
    const full = { version: 1, overviewOnly: true, rootId: "root", nodes: [nodes[0], ...extra], edges: extra.map(node => ({ ...edges[0], to: node.id })) };
    localStorage.setItem("problem-knowledge-map-v2:inline-one", JSON.stringify({ identity: JSON.stringify(session.problem), map: full }));
    render(<ConversationKnowledgeMap {...base}/>);
    await screen.findByText("已全部生成");
    expect(document.querySelectorAll("[data-knowledge-id]")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "展开本题知识图谱" }));
    expect(base.onOpen).toHaveBeenCalledWith();
    expect(JSON.parse(localStorage.getItem("problem-knowledge-map-v2:inline-one")!).map.nodes).toHaveLength(8);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("英文界面只翻译交互文案，不翻译模型生成的知识名称", async () => {
    localStorage.setItem(UI_LOCALE_KEY, "en");
    render(<UiLanguageProvider><ConversationKnowledgeMap {...base}/></UiLanguageProvider>);
    await screen.findByText("All concepts ready");
    expect(screen.getByText("Knowledge connections")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Explore concept: 长方形周长" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Expand this concept map" })).not.toBeNull();
  });
  it("引用首段已完成讲解的真实重点，不为导读增加模型请求，锁定讲解时隐藏摘录", async () => {
    const quote = "周长就是沿着长方形的边绕一整圈的总长度";
    const lesson: ChatMessage = { id: "first", kind: "assistant", role: "assistant", status: "complete", text: quote + "。", createdAt: "2026-09-10", emphasis: [{ kind: "text", target: quote, reason: "周长的含义是本题的重要起点。" }] };
    const view = render(<ConversationKnowledgeMap {...base} messages={[lesson]}/>);
    await screen.findByText("已全部生成");
    expect(screen.getByLabelText("摘自本题讲解").textContent).toBe(quote);
    expect(fetch).toHaveBeenCalledTimes(1);
    view.rerender(<ConversationKnowledgeMap {...base} messages={[lesson]} hideGuide/>);
    expect(screen.queryByLabelText("摘自本题讲解")).toBeNull();
    expect(screen.getByRole("heading", { name: "长方形周长" })).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("没有可靠摘录时展示核心知识，不拼凑一个假导读", async () => {
    render(<ConversationKnowledgeMap {...base}/>);
    await screen.findByText("已全部生成");
    expect(screen.queryByLabelText("摘自本题讲解")).toBeNull();
    expect(screen.getByRole("heading", { name: "长方形周长" })).not.toBeNull();
    expect(screen.getAllByText("长方形周长")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "查看知识点：长方形周长" }));
    expect(base.onOpen).toHaveBeenCalledWith({ id: "root", title: "长方形周长" });
  });
});
