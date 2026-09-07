// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { KnowledgeMapPreview } from "@/components/knowledge-map-preview";
import type { LearningSession } from "@/lib/learning/types";
const session = { flow: { focus: { kind: "problem" } }, nodes: [{ id: "a", kind: "concept", title: "单位量" }] } as unknown as LearningSession;
afterEach(cleanup);
it("完整图谱是轻量入口，不自动打开或生成", () => {
  const open = vi.fn();
  render(<KnowledgeMapPreview session={session} onOpen={open}/>);
  expect(screen.queryByText("单位量")).toBeNull();
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "本题知识图谱" }));
  expect(open).toHaveBeenCalledWith(undefined);
});
it("当前补基础节点明确时可定位，缺失时不猜", () => {
  const open = vi.fn();
  render(<KnowledgeMapPreview session={{ ...session, flow: { ...session.flow, focus: { kind: "node", nodeId: "a" } } }} onOpen={open}/>);
  fireEvent.click(screen.getByRole("button", { name: "本题知识图谱" }));
  expect(open).toHaveBeenCalledWith({ title: "单位量" });
});
