import { afterEach, describe, expect, it, vi } from "vitest";
import { animateHomeCompanion } from "@/lib/learning/home-companion-motion";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function setup({ reduced = false, broken = false } = {}) {
  vi.useFakeTimers();
  const animations: { cancel: ReturnType<typeof vi.fn> }[] = [];
  const animate = vi.fn(() => {
    const animation = { cancel: vi.fn() }; animations.push(animation); return animation;
  });
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible", activeElement: null as null | { matches: () => boolean } });
  const storage = new Map<string, string>();
  const win = Object.assign(new EventTarget(), {
    matchMedia: () => media,
    sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
  });
  let intersect: (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const root = Object.assign(new EventTarget(), {
    dataset: {} as Record<string, string>,
    closest: () => root,
    querySelector: () => ({ animate, getBoundingClientRect: () => ({ left: 260, width: 94 }), querySelector: () => ({ decode: () => broken ? Promise.reject(Error("image unavailable")) : Promise.resolve() }) }),
    querySelectorAll: () => [0, 1, 2].map(i => ({ animate, getBoundingClientRect: () => ({ right: 60 + i * 40 }) })),
  });
  vi.stubGlobal("document", doc); vi.stubGlobal("window", win);
  const visit = { introduced: false };
  const start = () => animateHomeCompanion(root as unknown as HTMLElement, visit);
  const dispose = start();
  await Promise.resolve(); await Promise.resolve();
  return { root, doc, win, media, animate, animations, dispose, disconnect, intersect, visit, start };
}

describe("小逗号推名字", () => {
  it("同一标签页刷新后仍立即介绍，不受旧会话标记影响", async () => {
    const s = await setup();
    s.win.sessionStorage.setItem("home-comma-push-introduced-v1", "1");
    vi.advanceTimersByTime(450);
    expect(s.root.dataset.interacting).toBe("introduce");
    s.dispose();
    const disposeRefresh = animateHomeCompanion(s.root as unknown as HTMLElement, { introduced: false });
    await Promise.resolve();
    vi.advanceTimersByTime(449);
    expect(s.root.dataset.interacting).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(s.root.dataset.interacting).toBe("introduce");
    expect(s.animate).toHaveBeenCalledTimes(8);
    disposeRefresh();
  });
  it("同一次首页暂停后恢复只保留轻互动，不重新隐藏名字", async () => {
    const s = await setup(); vi.advanceTimersByTime(450); s.dispose();
    const disposeResume = s.start();
    await Promise.resolve();
    vi.advanceTimersByTime(450);
    expect(s.root.dataset.interacting).toBeUndefined();
    vi.advanceTimersByTime(18_000 - 450);
    expect(s.root.dataset.interacting).toBe("nudge");
    disposeResume();
  });
  it("卸载时尚未解码的图片不能消费本次欢迎机会", async () => {
    const s = await setup(); s.dispose();
    const disposeAgain = s.start(); disposeAgain();
    await Promise.resolve();
    vi.advanceTimersByTime(450);
    expect(s.visit.introduced).toBe(false);
    expect(s.animate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("首次介绍结束后仍会间歇回应，反复点击不会叠加动画", async () => {
    const s = await setup();
    vi.advanceTimersByTime(450);
    expect(s.root.dataset.interacting).toBe("introduce");
    expect(s.animate).toHaveBeenCalledTimes(4);
    s.root.dispatchEvent(new Event("click"));
    expect(s.animate).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(2200);
    expect(s.root.dataset.interacting).toBeUndefined();
    vi.advanceTimersByTime(18_000);
    expect(s.root.dataset.interacting).toBe("nudge");
    expect(s.animate).toHaveBeenCalledTimes(8);
    s.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("点击形象可以重播轻碰，首次介绍不反复隐藏名字", async () => {
    const s = await setup(); vi.advanceTimersByTime(2650);
    s.root.dispatchEvent(new Event("click"));
    expect(s.root.dataset.interacting).toBe("nudge");
    s.dispose();
  });
  it("输入中立即停止，恢复后重新计时", async () => {
    const s = await setup(); vi.advanceTimersByTime(450);
    s.doc.activeElement = { matches: () => true };
    s.doc.dispatchEvent(new Event("focusin"));
    expect(s.root.dataset.interacting).toBeUndefined();
    vi.advanceTimersByTime(60_000); expect(s.animate).toHaveBeenCalledTimes(4);
    s.doc.activeElement = null; s.doc.dispatchEvent(new Event("focusout"));
    vi.advanceTimersByTime(18_000);
    expect(s.root.dataset.interacting).toBe("nudge"); s.dispose();
  });
  it("切到后台或滚出视口停止，回来不会补播积压的动画", async () => {
    const s = await setup(); vi.advanceTimersByTime(450);
    s.doc.visibilityState = "hidden"; s.doc.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(60_000); expect(s.animate).toHaveBeenCalledTimes(4);
    s.doc.visibilityState = "visible"; s.doc.dispatchEvent(new Event("visibilitychange"));
    s.intersect([{ isIntersecting: true, intersectionRatio: .3 }]);
    vi.advanceTimersByTime(60_000); expect(s.animate).toHaveBeenCalledTimes(4);
    s.intersect([{ isIntersecting: true, intersectionRatio: 1 }]);
    vi.advanceTimersByTime(18_000); expect(s.animate).toHaveBeenCalledTimes(8);
    s.dispose();
  });
  it("减少动态效果与图片失败时保留静态内容", async () => {
    const s = await setup({ reduced: true }); vi.advanceTimersByTime(30_000);
    expect(s.animate).not.toHaveBeenCalled(); s.dispose();
    const failed = await setup({ broken: true }); vi.advanceTimersByTime(30_000);
    expect(failed.animate).not.toHaveBeenCalled(); failed.dispose();
  });
  it("离开首页清理计时器和监听，后续事件不能复活动画", async () => {
    const s = await setup(); vi.advanceTimersByTime(450); s.dispose();
    expect(s.animations.every(a => a.cancel.mock.calls.length === 1)).toBe(true);
    expect(s.disconnect).toHaveBeenCalledOnce();
    s.root.dispatchEvent(new Event("click")); s.doc.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(60_000); expect(s.animate).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });
});
