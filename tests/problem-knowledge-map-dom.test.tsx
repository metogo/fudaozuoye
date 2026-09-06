// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let flowProps: any;

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    Background: () => <i data-testid="background"/>,
    Handle: () => null,
    MarkerType: { ArrowClosed: "arrow" },
    Position: { Top: "top", Bottom: "bottom" },
    applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
    ReactFlow: ({ nodes, nodeTypes, onNodeClick, onInit, ...props }: any) => {
      flowProps = { nodes, onNodeClick, ...props };
      React.useEffect(() => { onInit?.({ getZoom: () => 1, getViewport: () => ({ x: 0, y: 0, zoom: 1 }), zoomIn: vi.fn(), zoomOut: vi.fn(), setViewport: vi.fn() }); }, []);
      return <div data-testid="flow">{nodes.map((node: any) => {
        const Node = nodeTypes[node.type];
        return <div key={node.id} role="button" data-id={node.id} className="react-flow__node" onClick={() => onNodeClick?.({}, node)}><Node id={node.id} data={node.data} selected={node.selected}/></div>;
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
const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

describe("ProblemKnowledgeMapPage", () => {
  const close = vi.fn();
  beforeEach(() => {
    flowProps = undefined;
    close.mockReset();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn() });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("展示等待倒计时，并在图谱请求成功后支持查看节点说明和整理", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ map })).mockResolvedValueOnce(response({ detail: { summary: "判别式说明", application: "本题要让判别式非负。" } }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    expect(screen.getByRole("timer", { name: "预计还需约 10 秒", hidden: true })).not.toBeNull();
    await screen.findByTestId("flow");
    expect(screen.getByText("2 / 2 个知识点")).not.toBeNull();
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
    await screen.findByTestId("flow");
    expect(fetch).toHaveBeenCalledTimes(2);
    first.unmount();

    localStorage.setItem("problem-knowledge-map-v2:request-1", JSON.stringify({ identity: JSON.stringify(session.problem), map }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="another-token" onClose={close}/>);
    await screen.findByTestId("flow");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("详情失败时仍可浏览图谱，并允许单独重试说明", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ map })).mockResolvedValueOnce(response({}, false)).mockResolvedValueOnce(response({ detail: { summary: "恢复说明", application: "恢复使用" } }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    await screen.findByTestId("flow");
    fireEvent.click(screen.getByText("根的判别式"));
    expect(await screen.findByText("补充说明暂未加载，仍可浏览图谱。")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试说明", hidden: true }));
    expect(await screen.findByText("恢复说明")).not.toBeNull();
  });

  it("节点拖拽、空白处取消选择和分支展开都不会让图谱消失", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ map }));
    render(<ProblemKnowledgeMapPage session={session as never} stateToken="token" onClose={close}/>);
    await screen.findByTestId("flow");
    expect(flowProps.nodes).toHaveLength(2);
    flowProps.onNodesChange([{ type: "position", id: "delta", position: { x: 480, y: 260 } }]);
    flowProps.onNodeDragStop();
    fireEvent(window, new Event("pagehide"));
    expect(localStorage.getItem("problem-knowledge-map-v2:request-1")).toContain("delta");
    fireEvent.click(screen.getByText("收起基础"));
    expect(screen.getByText("展开 1 个基础")).not.toBeNull();
    fireEvent.click(screen.getByText("展开 1 个基础"));
    expect(screen.getByText("收起基础")).not.toBeNull();
    fireEvent.click(screen.getByText("根的判别式"));
    expect(await screen.findByLabelText("根的判别式的知识说明")).not.toBeNull();
    flowProps.onPaneClick();
    await waitFor(() => expect(screen.queryByLabelText("根的判别式的知识说明")).toBeNull());
    expect(screen.getByTestId("flow")).not.toBeNull();
  });
});
