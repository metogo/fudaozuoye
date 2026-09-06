// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeTree } from "@/components/knowledge-tree";

const session = {
  rootNodeId: "root",
  nodes: [
    { id: "root", title: "原题", kind: "problem", difficulty: 0, state: "learning", atomic: false },
    { id: "base", title: "判别式", kind: "concept", difficulty: 1, state: "mastered", atomic: false, diagnosticEvidence: "两个实数根", diagnosticEvidenceSource: "problem" },
    { id: "atom", title: "实数", kind: "concept", difficulty: 2, state: "known", atomic: true },
  ],
  edges: [{ from: "base", to: "root" }, { from: "atom", to: "base" }],
};

describe("知识树", () => {
  afterEach(cleanup);

  it("以原题为根按前置关系递归展示，突出当前节点并支持选择", () => {
    const select = vi.fn();
    render(<KnowledgeTree session={session as never} activeNodeId="base" highlightNodeId="atom" onSelect={select}/>);
    expect(screen.getByRole("button", { name: /原题/ })).not.toBeNull();
    const base = screen.getByRole("button", { name: /判别式/ });
    expect(base.getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("证据：题干原文“两个实数根”")).not.toBeNull();
    expect(screen.getByText("已到本学段学习起点，不再机械拆分")).not.toBeNull();
    fireEvent.click(base);
    expect(select).toHaveBeenCalledWith("base");
  });

  it("会话缺少根节点时不渲染误导性的关系", () => {
    const { container } = render(<KnowledgeTree session={{ ...session, rootNodeId: "missing" } as never} activeNodeId={null} highlightNodeId={null} onSelect={vi.fn()}/>);
    expect(container.innerHTML).toBe("");
  });
});
