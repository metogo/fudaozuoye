// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { KnowledgeMapExport } from "@/components/knowledge-map-export";
import type { ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";

const mocks = vi.hoisted(() => ({ toBlob: vi.fn(), download: vi.fn(), revoke: vi.fn(), setViewport: vi.fn().mockResolvedValue(true) }));
vi.mock("html-to-image", () => ({ toBlob: mocks.toBlob }));
vi.mock("@xyflow/react", () => {
  const flow = { getNodes: () => [{ id: "core", position: { x: 0, y: 0 }, measured: { width: 194, height: 136 } }], setViewport: mocks.setViewport };
  return { MarkerType: { ArrowClosed: "arrowclosed" }, ReactFlow: ({ children }: { children: ReactNode }) => <div>{children}</div>, useNodesInitialized: () => true, useReactFlow: () => flow };
});
const map: ProblemKnowledgeMap = { version: 1, overviewOnly: true, rootId: "core", nodes: [{ id: "core", title: "核心知识", summary: "", application: "", evidence: "题目" }], edges: [] };
const props = { map, positions: { core: { x: 0, y: 0 } }, complete: false, nodeTypes: {} };
const flush = async () => act(async () => { await vi.advanceTimersByTimeAsync(10); });

describe("图谱图片下载生命周期", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks();
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 1));
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:graph"), revokeObjectURL: mocks.revoke });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(mocks.download);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("未生成根节点时不可导出；导出只取点击时快照，生成新节点不会混入", async () => {
    let resolve!: (blob: Blob) => void;
    mocks.toBlob.mockReturnValueOnce(new Promise<Blob>(r => { resolve = r; }));
    const view = render(<KnowledgeMapExport {...props} map={{ ...map, nodes: [] }}/>);
    expect(screen.getByRole("button", { name: "导出图片" }).hasAttribute("disabled")).toBe(true);
    view.rerender(<KnowledgeMapExport {...props}/>);
    fireEvent.click(screen.getByRole("button", { name: "导出图片" }));
    view.rerender(<KnowledgeMapExport {...props} map={{ ...map, nodes: [...map.nodes, { ...map.nodes[0], id: "next" }] }} complete/>);
    await flush();
    expect(mocks.toBlob.mock.calls[0][0].textContent).toContain("生成中快照 · 已生成 1 个知识点");
    expect(screen.getByRole("button", { name: "导出图片" }).getAttribute("aria-busy")).toBe("true");
    await act(async () => resolve(new Blob(["png"], { type: "image/png" })));
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "再次下载" }).getAttribute("download")).toMatch(/\.png$/);
    view.unmount();
    expect(mocks.revoke).toHaveBeenCalledWith("blob:graph");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("失败明确提示并允许重试，不生成空白下载", async () => {
    mocks.toBlob.mockRejectedValueOnce(new Error("编码失败")).mockResolvedValueOnce(new Blob(["png"]));
    render(<KnowledgeMapExport {...props}/>);
    fireEvent.click(screen.getByRole("button", { name: "导出图片" })); await flush();
    expect(screen.getByRole("alert").textContent).toBe("编码失败");
    expect(mocks.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "导出图片" })); await flush();
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
  it("退出画布后不触发迟到下载", async () => {
    let resolve!: (blob: Blob) => void;
    mocks.toBlob.mockReturnValueOnce(new Promise<Blob>(r => { resolve = r; }));
    const view = render(<KnowledgeMapExport {...props}/>);
    fireEvent.click(screen.getByRole("button", { name: "导出图片" })); await flush();
    view.unmount();
    await act(async () => resolve(new Blob(["png"])));
    expect(mocks.download).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("超过30秒解除忙碌状态，迟到的编码结果不会开始下载", async () => {
    let resolve!: (blob: Blob) => void;
    mocks.toBlob.mockReturnValueOnce(new Promise<Blob>(r => { resolve = r; }));
    render(<KnowledgeMapExport {...props}/>);
    fireEvent.click(screen.getByRole("button", { name: "导出图片" })); await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(screen.getByRole("alert").textContent).toContain("超时");
    expect(screen.getByRole("button", { name: "导出图片" }).hasAttribute("disabled")).toBe(false);
    await act(async () => resolve(new Blob(["png"])));
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
