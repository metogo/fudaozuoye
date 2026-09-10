// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Node, ReactFlowProps, ReactFlowInstance } from "@xyflow/react";
import type { MapConcept } from "@/lib/learning/knowledge-map";
type TestNode = Node<{ concept: MapConcept; root: boolean; expanded: boolean; childCount: number; dimmed: boolean; pending?: boolean; stopped?: boolean; toggle: (id: string) => void }, "concept">;
type FlowProps = ReactFlowProps<TestNode>;
function createFlowApi() { return { getZoom: () => 1, getViewport: () => ({ x: 0, y: 0, zoom: 1 }), zoomIn: vi.fn(), zoomOut: vi.fn(), setViewport: vi.fn() }; }
let flowProps: FlowProps | undefined;
let flowApi: ReturnType<typeof createFlowApi> | undefined;

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    Background: () => <i data-testid="background"/>,
    Handle: () => null,
    MarkerType: { ArrowClosed: "arrow" },
    Position: { Top: "top", Bottom: "bottom" },
    applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
    ReactFlow: ({ nodes, nodeTypes, onNodeClick, onInit, ...props }: FlowProps) => {
      flowProps = { nodes, onNodeClick, ...props };
      const initRef = React.useRef(onInit);
      React.useEffect(() => {
        flowApi = createFlowApi();
        // The mock implements only viewport methods consumed by this component.
        initRef.current?.(flowApi as unknown as ReactFlowInstance<TestNode>);
      }, []);
      return <div data-testid="flow" onClick={event => { if (event.target === event.currentTarget) props.onPaneClick?.(event); }}>{nodes?.map((node) => {
        const Node = nodeTypes!.concept;
        return <div key={node.id} role="button" data-id={node.id} className="react-flow__node" onClick={(event) => onNodeClick?.(event, node)}><Node id={node.id} data={node.data} selected={node.selected === true} type="concept" dragging={false} zIndex={0} isConnectable draggable selectable deletable positionAbsoluteX={node.position.x} positionAbsoluteY={node.position.y}/></div>;
      })}</div>;
    },
  };
});
vi.mock("@/components/lazy-rich-learning-text", () => ({ RichLearningText: ({ text }: { text: string }) => <span>{text}</span> }));

import { ProblemKnowledgeMapPage } from "@/components/problem-knowledge-map";

const session = {
  requestId: "request-1",
  problem: { text: "已知一元二次方程有两个实数根。", visualContext: { summary: "两个实数根", facts: [] } },
};
const map = {
  version: 1,
  rootId: "quadratic",
  nodes: [
    { id: "quadratic", title: "一元二次方程", summary: "含未知数的二次方程。", application: "先识别题型。", evidence: "一元二次方程" },
    { id: "delta", title: "根的判别式", summary: "判别根的情况。", application: "用来判断实数根。", evidence: "两个实数根" },
  ],
  edges: [{ from: "quadratic", to: "delta", kind: "prerequisite", reason: "解题前要判断根的情况。" }],
};
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const plan = { rootId: map.rootId, nodes: map.nodes.map(n => ({ id: n.id, parents: map.edges.filter(e => e.to === n.id).map(e => e.from) })) };
const nodeEvent = (index: number) => ({ type: "node", node: map.nodes[index], edges: map.edges.filter(e => e.to === map.nodes[index].id) });
const response = (body: { map?: typeof map; detail?: { summary: string; application: string }; error?: { message: string } }, ok = true) => body.map && ok ? new Response(
  frame("map.plan", { type: "plan", plan }) +
  map.nodes.map((_, index) => frame("map.node", nodeEvent(index))).join("") +
  frame("complete", { total: map.nodes.length }), { headers: { "Content-Type": "text/event-stream" } }
) : new Response(JSON.stringify(body), { status: ok ? 200 : 503, headers: { "Content-Type": "application/json" } });

describe("ProblemKnowledgeMapPage", () => {
  const close = vi.fn();
  beforeEach(() => {
    flowProps = undefined;
    flowApi = undefined;
    close.mockReset();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("退出及卸载时先关闭仍连接的原生弹层，并恢复入口焦点", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const opener = document.createElement("button");
    document.body.append(opener);
    const connected: boolean[] = [];
    vi.mocked(HTMLDialogElement.prototype.close).mockImplementation(function (this: HTMLDialogElement) { connected.push(this.isConnected); this.open = false; });
    for (const exit of ["return", "cancel", "unmount"]) {
      opener.focus();
      const view = render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={() => view.unmount()}/>);
      const dialog = document.querySelector("dialog")!;
      screen.getByRole("button", { name: "返回对话" }).focus();
      if (exit === "return") fireEvent.click(screen.getByRole("button", { name: "返回对话" }));
      else if (exit === "cancel") fireEvent(dialog, new Event("cancel", { cancelable: true }));
      else view.unmount();
      expect(document.querySelector("dialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
    }
    expect(connected).toEqual([true, true, true]);
    opener.remove();
  });

  it("立即显示画布，并在图谱请求成功后支持查看节点说明和整理", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ map })).mockResolvedValueOnce(response({ detail: { summary: "判别式说明", application: "本题要让判别式非负。" } }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    expect(screen.getByTestId("flow")).not.toBeNull();
    expect(screen.getByText("正在梳理本题知识")).not.toBeNull();
    expect(screen.queryByRole("timer", { hidden: true })).toBeNull();
    await screen.findByText("根的判别式");
    expect(screen.getByRole("progressbar", { hidden: true }).getAttribute("aria-valuetext")).toBe("已生成 2 / 2 个知识点");
    fireEvent.click(screen.getByText("根的判别式"));
    await screen.findByText("判别式说明");
    expect(screen.getByText("本题要让判别式非负。")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "整理", hidden: true }));
    expect(screen.getAllByRole("status", { hidden: true }).at(-1)?.textContent).toContain("已恢复整齐布局");
    fireEvent.click(screen.getByRole("button", { name: "关闭知识卡片", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "返回对话", hidden: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("请求失败时提供重试，并从有效缓存恢复图谱而不再次请求", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ error: { message: "网络暂不可用" } }, false)).mockResolvedValueOnce(response({ map }));
    const first = render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    expect((await screen.findByRole("alert", { hidden: true })).textContent).toContain("网络暂不可用");
    fireEvent.click(screen.getByRole("button", { name: /重试生成/, hidden: true }));
    await screen.findByText("根的判别式");
    expect(fetch).toHaveBeenCalledTimes(2);
    first.unmount();

    localStorage.setItem("problem-knowledge-map-v2:request-1", JSON.stringify({ identity: JSON.stringify(session.problem), map }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="another-token" onClose={close}/>);
    await screen.findByText("根的判别式");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("详情失败时仍可浏览图谱，并允许单独重试说明", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ map })).mockResolvedValueOnce(response({}, false)).mockResolvedValueOnce(response({ detail: { summary: "恢复说明", application: "恢复使用" } }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    await screen.findByText("根的判别式");
    fireEvent.click(screen.getByText("根的判别式"));
    expect(await screen.findByText("补充说明暂未加载，仍可浏览图谱。")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试说明", hidden: true }));
    expect(await screen.findByText("恢复说明")).not.toBeNull();
  });

  it("节点拖拽、空白处取消选择和分支展开都不会让图谱消失", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ map }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    await screen.findByText("根的判别式");
    expect(flowProps!.nodes).toHaveLength(2);
    flowProps!.onNodesChange!([{ type: "position", id: "delta", position: { x: 480, y: 260 } }]);
    flowProps!.onNodeDragStop!({} as MouseEvent, flowProps!.nodes![0], flowProps!.nodes!);
    fireEvent(window, new Event("pagehide"));
    expect(localStorage.getItem("problem-knowledge-map-v2:request-1")).toContain("delta");
    fireEvent.click(screen.getByText("收起基础"));
    expect(screen.getByText("展开 1 个基础")).not.toBeNull();
    fireEvent.click(screen.getByText("展开 1 个基础"));
    expect(screen.getByText("收起基础")).not.toBeNull();
    fireEvent.click(screen.getByText("根的判别式"));
    expect(await screen.findByLabelText("根的判别式的知识说明")).not.toBeNull();
    fireEvent.click(screen.getByTestId("flow"));
    await waitFor(() => expect(screen.queryByLabelText("根的判别式的知识说明")).toBeNull());
    expect(screen.getByTestId("flow")).not.toBeNull();
  });

  it("能容忍损坏缓存，并保留键盘、缩放和节点尺寸更新等图谱操作", async () => {
    localStorage.setItem("problem-knowledge-map-v2:request-1", "not-json");
    vi.mocked(fetch).mockResolvedValueOnce(response({ map }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    await screen.findByText("根的判别式");
    expect(fetch).toHaveBeenCalledTimes(1);

    const root = document.querySelector('[data-id="quadratic"]');
    expect(root).not.toBeNull();
    fireEvent.keyDown(root!, { key: "Enter" });
    expect(await screen.findByLabelText("一元二次方程的知识说明")).not.toBeNull();
    flowProps!.onNodesChange!([
      { type: "dimensions", id: "quadratic", dimensions: { width: 220, height: 100 } },
      { type: "dimensions", id: "quadratic", dimensions: { width: -1, height: 0 } },
      { type: "select", id: "quadratic", selected: true },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "放大图谱", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "缩小图谱", hidden: true }));
    expect(flowApi!.zoomIn).toHaveBeenCalledTimes(1);
    expect(flowApi!.zoomOut).toHaveBeenCalledTimes(1);
    flowProps!.onMoveEnd!(null, { x: 20, y: 30, zoom: 1.2 });
    expect(localStorage.getItem("problem-knowledge-map-v2:request-1")).toContain('"zoom":1.2');
  });

  it("布局保存失败只提示当前会话，图谱仍可整理与使用", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ map }));
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    await screen.findByText("根的判别式");
    flowProps!.onNodeDragStop!({} as MouseEvent, flowProps!.nodes![0], flowProps!.nodes!);
    await waitFor(() => expect(screen.getByText("浏览器暂时无法保存布局，本次仍可自由调整。")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "整理", hidden: true }));
    expect(screen.getByTestId("flow")).not.toBeNull();
    write.mockRestore();
  });

  it("整份清单前显示已校验的根，但不伪报总数、不缓存、不开放导出或详情", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({ earlyRoot: true, stream: true });
    const send = async (event: string, data: unknown) => act(async () => { controller.enqueue(new TextEncoder().encode(frame(event, data))); });
    await send("map.root", { node: map.nodes[0] });
    expect(screen.getByText("一元二次方程")).not.toBeNull();
    expect(document.querySelector(".knowledge-map-continuation")).not.toBeNull();
    expect(document.querySelector(".knowledge-map-canvas-activity")?.textContent).toContain("图谱还在展开");
    expect(flowProps!.nodes).toHaveLength(1); // The continuation is not a made-up knowledge node.
    expect(flowProps!.edges).toHaveLength(0);
    expect(screen.getByText("核心知识已识别，正在梳理关联")).not.toBeNull();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBeNull();
    expect(screen.getByRole("button", { name: "导出图片" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByText("一元二次方程"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
    const position = flowProps!.nodes![0].position;
    await send("map.plan", { type: "plan", plan });
    expect(document.querySelector(".knowledge-map-continuation")).toBeNull();
    await send("map.node", nodeEvent(0));
    expect(document.querySelector(".knowledge-map-continuation")).toBeNull();
    expect(document.querySelector('.knowledge-map-pending[data-stopped="false"]')).not.toBeNull();
    expect(document.querySelector(".knowledge-map-canvas-activity")?.textContent).toContain("已生成 1 / 2 个知识点");
    expect(flowProps!.edges).toEqual([expect.objectContaining({ id: "pending:quadratic:delta", animated: true, source: "quadratic", target: "delta" })]);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    expect(flowProps!.nodes!.find(n => n.id === map.rootId)?.position).toEqual(position);
    await send("map.node", nodeEvent(1));
    expect(document.querySelector(".knowledge-map-canvas-activity")?.textContent).toContain("正在确认知识关系");
    expect(document.querySelector(".knowledge-map-pending")).toBeNull();
    expect(flowProps!.edges).toEqual([expect.objectContaining({ id: "quadratic:delta", animated: false })]);
    await send("complete", { total: 2 });
    await waitFor(() => expect(screen.getByText("已全部生成")).not.toBeNull());
    expect(localStorage.length).toBe(1);
    expect(document.querySelector(".knowledge-map-canvas-activity")).toBeNull();
    expect(localStorage.getItem("problem-knowledge-map-v2:request-1")).not.toContain("正在展开关联知识");
  });

  it("清单修正时撤回旧预览；传输失败也不留下未经完整清单确认的根", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream({ start(c) { controller = c; } }), { headers: { "Content-Type": "text/event-stream" } }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const send = async (event: string, data: unknown) => act(async () => { controller.enqueue(new TextEncoder().encode(frame(event, data))); });
    await send("map.root", { node: map.nodes[0] });
    await send("map.root", { node: null });
    expect(screen.queryByText("一元二次方程")).toBeNull();
    expect(document.querySelector(".knowledge-map-continuation")).toBeNull();
    await send("map.root", { node: map.nodes[0] });
    await send("error", { message: "模型连接中断" });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("模型连接中断"));
    expect(screen.queryByText("一元二次方程")).toBeNull();
    expect(document.querySelector(".knowledge-map-canvas-activity")).toBeNull();
    expect(document.querySelector('.knowledge-map-pending[data-stopped="true"]')).not.toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("真实分块到达才增加计数，失败保留节点，不缓存半成品，关闭取消请求", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel: cancelled });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    const view = render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    expect(screen.getByTestId("flow")).not.toBeNull();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const send = async (event: string, data: unknown) => act(async () => { controller.enqueue(new TextEncoder().encode(frame(event, data))); });
    await send("map.plan", { type: "plan", plan });
    expect(screen.getByRole("progressbar", { hidden: true }).getAttribute("aria-valuenow")).toBe("0");
    await send("map.node", nodeEvent(0));
    expect(screen.getByText("一元二次方程")).not.toBeNull();
    expect(screen.queryByText("根的判别式")).toBeNull();
    expect(screen.getByRole("progressbar", { hidden: true }).getAttribute("aria-valuenow")).toBe("1");
    const position = flowProps!.nodes!.find((n: { id: string }) => n.id === "quadratic")!.position;
    expect(localStorage.getItem("problem-knowledge-map-v2:request-1")).toBeNull();
    await send("error", { message: "连接中断" });
    expect(screen.getByText("一元二次方程")).not.toBeNull();
    expect(screen.getByRole("alert", { hidden: true }).textContent).toBe("连接中断");
    expect(document.querySelector(".knowledge-map-canvas-activity")).toBeNull();
    expect(document.querySelector('.knowledge-map-pending[data-stopped="false"]')).toBeNull();
    expect(flowProps!.edges?.every(edge => !edge.animated)).toBe(true);
    expect(flowProps!.nodes!.find((n: { id: string }) => n.id === "quadratic")!.position).toEqual(position);
    expect(localStorage.getItem("problem-knowledge-map-v2:request-1")).toBeNull();
    await waitFor(() => expect(cancelled).toHaveBeenCalled());
    view.unmount();
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(true);
  });

  it("生成期间查看根节点，后续节点和完成事件不会重复请求详情或移动视角", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }))
      .mockResolvedValueOnce(response({ detail: { summary: "当前根节点", application: "用于本题" } }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const send = async (event: string, data: unknown) => act(async () => { controller.enqueue(new TextEncoder().encode(frame(event, data))); });
    await send("map.plan", { type: "plan", plan });
    await send("map.node", nodeEvent(0));
    fireEvent.click(screen.getByText("一元二次方程"));
    await screen.findByText("当前根节点");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    const views = flowApi!.setViewport.mock.calls.length;
    const rootPosition = flowProps!.nodes!.find((n: { id: string }) => n.id === "quadratic")!.position;
    await send("map.node", nodeEvent(1));
    await send("complete", { total: 2 });
    await waitFor(() => expect(screen.getByText("已全部生成")).not.toBeNull());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(flowProps!.nodes!.find((n: { id: string }) => n.id === "quadratic")!.position).toEqual(rootPosition);
    expect(flowApi!.setViewport).toHaveBeenCalledTimes(views);
    expect(localStorage.getItem("problem-knowledge-map-v2:request-1")).toContain("delta");
  });

  it("后面的独立节点先到达，不会与加载占位重复，也不移动已显示节点", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const send = async (event: string, data: unknown) => act(async () => { controller.enqueue(new TextEncoder().encode(frame(event, data))); });
    const sibling = { ...map.nodes[1], id: "sibling", title: "方程的根" };
    const largerPlan = { ...plan, nodes: [...plan.nodes, { id: sibling.id, parents: [map.rootId] }] };
    await send("map.plan", { type: "plan", plan: largerPlan });
    await send("map.node", nodeEvent(0));
    await send("map.node", { type: "node", node: sibling, edges: [{ ...map.edges[0], to: sibling.id }] });
    expect(screen.getByText("方程的根")).not.toBeNull();
    expect(screen.getByRole("progressbar", { hidden: true }).getAttribute("aria-valuenow")).toBe("2");
    const nodes = flowProps!.nodes as { id: string; position: unknown; data: { pending?: boolean } }[];
    expect(nodes.map(n => n.id)).toEqual([map.rootId, "sibling", "delta"]);
    expect(nodes.find(n => n.id === "delta")?.data.pending).toBe(true);
    const position = nodes.find(n => n.id === "sibling")!.position;
    await send("map.node", nodeEvent(1));
    await send("complete", { total: 3 });
    expect(flowProps!.nodes!.find((n: { id: string }) => n.id === "sibling")!.position).toEqual(position);
    expect(screen.getByText("已全部生成")).not.toBeNull();
  });

  it("收到较大清单后浏览器不再在48秒取消，退出仍取消并清理预算", async () => {
    vi.useFakeTimers();
    try {
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
      vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
      const view = render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      const largerPlan = { rootId: map.rootId, nodes: [plan.nodes[0], ...Array.from({ length: 15 }, (_, i) => ({ id: `k${i}`, parents: [map.rootId] }))] };
      await act(async () => { controller.enqueue(new TextEncoder().encode(frame("map.plan", { type: "plan", plan: largerPlan }) + frame("map.node", nodeEvent(0)))); });
      await act(async () => { await vi.advanceTimersByTimeAsync(48000); });
      const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
      expect(signal.aborted).toBe(false);
      expect(screen.getByRole("progressbar", { hidden: true }).getAttribute("aria-valuemax")).toBe("16");
      view.unmount();
      expect(signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      controller.close();
    } finally { vi.useRealTimers(); }
  });
});
