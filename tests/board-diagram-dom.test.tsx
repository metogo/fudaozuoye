// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardDiagram } from "@/components/board-diagram";

const renderMermaid = vi.fn();
const initialize = vi.fn();
vi.mock("mermaid", () => ({ default: { initialize, render: renderMermaid } }));
const visual = { kind: "concept_graph", title: "根的关系", direction: "top-down", evidence: "有两个实数根", caption: "先看条件", nodes: [{ id: "given", label: "两个实数根", role: "given" }, { id: "rule", label: "判别式", role: "relation" }], edges: [{ from: "given", to: "rule", label: "推出" }] };

describe("板书关系图", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  it("生成安全 Mermaid 图形，并在绘制前声明加载状态", async () => {
    renderMermaid.mockResolvedValue({ svg: '<svg data-graph="ok"><text>关系</text></svg>' });
    render(<BoardDiagram visual={visual as never}/>);
    expect(screen.getByRole("status", { name: "正在绘制关系图" })).not.toBeNull();
    await waitFor(() => expect(document.querySelector("[data-graph='ok']")).not.toBeNull());
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: "strict" }));
    expect(renderMermaid).toHaveBeenCalledWith(expect.stringMatching(/^board-diagram-/), expect.stringContaining("两个实数根"));
  });
  it("绘图失败时按真实节点与边提供文本关系，避免空白", async () => {
    renderMermaid.mockRejectedValue(new Error("renderer unavailable"));
    render(<BoardDiagram visual={visual as never}/>);
    await screen.findByRole("status");
    expect(screen.getByText("关系图暂时无法绘制，按真实连线列出：")).not.toBeNull();
    expect(screen.getByText(/两个实数根/).textContent).toContain("推出");
    expect(screen.getByText(/两个实数根/).textContent).toContain("判别式");
  });
});
