import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { observeChatEdgeFade } from "@/lib/learning/chat-edge-fade";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  let callback: FrameRequestCallback | undefined;
  const raf = vi.fn((fn: FrameRequestCallback) => { callback = fn; return 1; });
  const cancel = vi.fn(() => { callback = undefined; });
  const observe = vi.fn(), disconnect = vi.fn();
  let resize: () => void = () => {};
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("ResizeObserver", class { constructor(fn: () => void) { resize = fn; } observe = observe; disconnect = disconnect; });
  const win = Object.assign(new EventTarget(), { visualViewport: new EventTarget() });
  vi.stubGlobal("window", win);
  const area = Object.assign(new EventTarget(), { scrollHeight: 1000, scrollTop: 0, clientHeight: 500, firstElementChild: {} });
  const styles = new Map<string, string>();
  const dock = { dataset: {} as Record<string, string>, style: { setProperty: (key: string, value: string) => styles.set(key, value), removeProperty: (key: string) => styles.delete(key) } };
  const stop = observeChatEdgeFade(area as unknown as HTMLElement, dock as unknown as HTMLElement);
  return { area, dock, styles, raf, cancel, observe, disconnect, win, stop, resize: () => resize(), flush: () => { const fn = callback; callback = undefined; fn?.(0); } };
}

describe("对话底部渐隐", () => {
  it("有下方内容时显示，接近底部渐弱，到底或短内容时消失", () => {
    const t = setup(); t.flush();
    expect(t.dock.dataset.edgeOverflow).toBe("true");
    expect(t.styles.get("--chat-edge-opacity")).toBe("1");
    t.area.scrollTop = 476; t.area.dispatchEvent(new Event("scroll")); t.flush();
    expect(t.styles.get("--chat-edge-opacity")).toBe("0.5");
    t.area.scrollTop = 500; t.area.dispatchEvent(new Event("scroll")); t.flush();
    expect(t.dock.dataset.edgeOverflow).toBe("false");
    t.area.scrollTop = 0; t.area.scrollHeight = 300; t.resize(); t.flush();
    expect(t.styles.get("--chat-edge-opacity")).toBe("0"); t.stop();
  });
  it("流式内容增长和键盘引起的视口变化都会更新，事件只按帧测量", () => {
    const t = setup(); t.area.scrollHeight = 500; t.flush();
    expect(t.dock.dataset.edgeOverflow).toBe("false");
    t.area.scrollHeight = 800; t.resize(); t.resize(); t.win.visualViewport.dispatchEvent(new Event("resize"));
    expect(t.raf).toHaveBeenCalledTimes(2); t.flush();
    expect(t.dock.dataset.edgeOverflow).toBe("true");
    expect(t.observe).toHaveBeenCalledTimes(2); t.stop();
  });
  it("清理观察器、待执行帧及样式，不残留在首页或浮动引用输入状态", () => {
    const t = setup(); t.flush(); t.resize(); t.stop();
    expect(t.cancel).toHaveBeenCalledOnce(); expect(t.disconnect).toHaveBeenCalledOnce();
    expect(t.dock.dataset.edgeOverflow).toBeUndefined(); expect(t.styles.size).toBe(0);
    const count = t.raf.mock.calls.length;
    t.area.dispatchEvent(new Event("scroll")); t.win.dispatchEvent(new Event("resize"));
    t.resize();
    expect(t.raf).toHaveBeenCalledTimes(count);
  });
  it("遮罩不截获点击，不更改滚动策略，并尊重减少动态效果和打印", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const rule = css.match(/\.lesson-chat-shell \.chat-composer-dock::before \{([^}]+)\}/)![1];
    expect(rule).toContain("pointer-events: none"); expect(rule).toContain("position: absolute");
    expect(rule).not.toContain("backdrop-filter");
    const chat = readFileSync("components/learning-chat.tsx", "utf8");
    expect(chat).toContain("const edgeFadeEnabled = !isHome && !quote;");
    expect(css).toContain(".chat-composer-dock::before { display: none; }");
  });
});
