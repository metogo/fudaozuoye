// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactFlowInstance } from "@xyflow/react";
import { useKnowledgeMapCamera } from "@/components/use-knowledge-map-camera";
import type { ConceptNode } from "@/components/knowledge-map-node";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const tick = () => act(() => vi.advanceTimersByTime(20));
function setup(width = 390, height = 600) {
  const element = document.createElement("div");
  Object.defineProperties(element, { clientWidth: { value: width }, clientHeight: { value: height } });
  const setViewport = vi.fn();
  const node = (id: string, x = 0, y = 0): ConceptNode => ({ id, type: "concept", position: { x, y }, measured: { width: 194, height: 160 }, data: { concept: { id, title: id, summary: "", evidence: "", application: "" }, root: false, expanded: true, childCount: 0, dimmed: false, toggle: vi.fn() } });
  const options = {
    flow: { setViewport } as unknown as ReactFlowInstance<ConceptNode>, canvas: { current: element },
    target: node("root"), complete: false, error: "", selected: null as string | null,
    interacted: { current: false }, recoverView: vi.fn(),
  };
  return { options, setViewport, node };
}

it.each([[390, 600], [1280, 700], [320, 250]])("进入时适配 %s×%s 画布，逐节点居中并在完成后恢复全图", (width, height) => {
  const { options, setViewport, node } = setup(width, height);
  const view = renderHook(useKnowledgeMapCamera, { initialProps: options }); tick();
  const [first, animation] = setViewport.mock.calls[0];
  expect(animation.duration).toBe(0);
  expect(first.x + 97 * first.zoom).toBeCloseTo(width / 2);
  expect(first.y + 80 * first.zoom).toBeCloseTo(height / 2 + 12);
  expect(194 * first.zoom).toBeLessThanOrEqual(width - 64);
  expect(160 * first.zoom).toBeLessThanOrEqual(height - 140);
  for (const target of [node("next", 232, 208), node("third", -232, 416)]) {
    view.rerender({ ...options, target }); tick();
    const [viewport, animation] = setViewport.mock.calls.at(-1)!;
    expect(animation.duration).toBe(650);
    expect(viewport.x + (target.position.x + 97) * viewport.zoom).toBeCloseTo(width / 2);
    expect(viewport.y + (target.position.y + 80) * viewport.zoom).toBeCloseTo(height / 2 + 12);
  }
  view.rerender({ ...options, complete: true }); tick();
  expect(options.recoverView).toHaveBeenCalledWith(true);
});

it("同一目标不反复启动动画，用户接管后新节点和完成事件不抢镜头", () => {
  const { options, setViewport, node } = setup();
  const view = renderHook(useKnowledgeMapCamera, { initialProps: options }); tick();
  view.rerender({ ...options, target: node("root") }); tick();
  expect(setViewport).toHaveBeenCalledTimes(1);
  options.interacted.current = true;
  view.rerender({ ...options, target: node("next") }); tick();
  view.rerender({ ...options, complete: true }); tick();
  expect(setViewport).toHaveBeenCalledTimes(1);
  expect(options.recoverView).not.toHaveBeenCalled();
});

it("失败显示已生成范围，不假装完成；卸载取消尚未执行的镜头，重试重新开始", () => {
  const { options, node, setViewport } = setup();
  const view = renderHook(useKnowledgeMapCamera, { initialProps: options }); tick();
  view.rerender({ ...options, error: "网络中断" }); tick();
  expect(options.recoverView).toHaveBeenCalledWith(true);
  view.rerender({ ...options, target: node("cancelled") }); view.unmount(); tick();
  expect(setViewport).toHaveBeenCalledTimes(1);
  renderHook(useKnowledgeMapCamera, { initialProps: { ...options, target: node("retry") } }); tick();
  expect(setViewport.mock.calls.at(-1)![1].duration).toBe(0);
});

it("缓存图直接显示整理状态；减少动态效果设置下逐节点切换也无动画", () => {
  const { options, setViewport, node } = setup();
  const cached = renderHook(useKnowledgeMapCamera, { initialProps: { ...options, complete: true } }); tick();
  expect(options.recoverView).toHaveBeenCalledWith(false); cached.unmount();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const live = renderHook(useKnowledgeMapCamera, { initialProps: options }); tick();
  live.rerender({ ...options, target: node("next", 232, 208) }); tick();
  expect(setViewport.mock.calls.every(([, animation]) => animation.duration === 0)).toBe(true);
});
