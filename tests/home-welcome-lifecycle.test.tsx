import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock("react"); vi.resetModules(); });

async function setup({ reduced = false, broken = false, active = true } = {}) {
  vi.resetModules();
  let cleanup: (() => void) | undefined;
  let frame: (() => void) | undefined;
  const handlers = new Map<string, () => void>();
  const storage = new Map<string, string>();
  const rect = { left: 32, top: 154, width: 326, height: 125 };
  const dock = { style: { visibility: "" }, getBoundingClientRect: () => ({ left: 27, top: 28, width: 42, height: 42 }) };
  const animations: { cancel: ReturnType<typeof vi.fn>; onfinish?: () => void }[] = [];
  const animate = vi.fn(() => { const a = { cancel: vi.fn() }; animations.push(a); return a; });
  const images = [0, 1].map(() => ({ decode: () => broken ? Promise.reject(new Error("404")) : Promise.resolve(), animate }));
  const actor = {
    hidden: true, dataset: {} as Record<string, string>, style: {} as Record<string, string>, animate,
    removeAttribute: () => { delete actor.dataset.playing; },
    querySelectorAll: () => images,
    closest: () => ({ querySelector: (selector: string) => selector === ".brand-mark" ? dock : { getBoundingClientRect: () => rect } }),
  };
  const removeEventListener = vi.fn((name: string) => { handlers.delete(name); });
  vi.stubGlobal("window", {
    innerWidth: 390, innerHeight: 844,
    sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
    matchMedia: () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    addEventListener: (name: string, fn: () => void) => handlers.set(name, fn), removeEventListener,
  });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn(), createRange: () => ({ selectNodeContents: vi.fn(), getBoundingClientRect: () => ({ left: 32, top: 194, width: 208, height: 42 }) }) });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { frame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.doMock("react", () => ({ useRef: () => ({ current: actor }), useEffect: (effect: () => (() => void) | undefined) => { cleanup = effect(); } }));
  const { HomeWelcomeMotion } = await import("@/components/home-welcome-motion");
  HomeWelcomeMotion({ active });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  return { actor, dock, animations, handlers, storage, cleanup: () => cleanup?.(), start: () => frame?.(), renderAgain: () => HomeWelcomeMotion({ active: true }) };
}

describe("迎接动效的清理与安全降级", () => {
  it("减少动态效果时只保留静态图标", async () => {
    const s = await setup({ reduced: true }); s.start();
    expect(s.animations).toHaveLength(0); expect(s.actor.hidden).toBe(true); expect(s.dock.style.visibility).toBe("");
  });
  it("非首页不启动", async () => {
    const s = await setup({ active: false }); s.start(); expect(s.animations).toHaveLength(0);
  });
  it("一次点按结束动画但不拦截默认点击，全部监听器及时清理", async () => {
    const s = await setup(); s.start();
    expect(s.actor.hidden).toBe(false); expect(s.dock.style.visibility).toBe("hidden");
    s.handlers.get("pointerdown")!();
    expect(s.actor.hidden).toBe(true); expect(s.dock.style.visibility).toBe("");
    expect(s.handlers.size).toBe(0); expect(s.animations.every(a => a.cancel.mock.calls.length === 1)).toBe(true);
    s.cleanup();
  });
  it("动画自然结束后恢复同一图标，不重复播放", async () => {
    const s = await setup(); s.start(); s.animations[0].onfinish!();
    expect(s.actor.hidden).toBe(true); expect(s.dock.style.visibility).toBe(""); expect(s.handlers.size).toBe(0);
    const count = s.animations.length; s.cleanup(); s.renderAgain(); s.start(); expect(s.animations).toHaveLength(count);
  });
  it("卸载后迟到的图片或帧回调不能重启动画", async () => {
    const s = await setup(); s.cleanup(); s.start(); expect(s.animations).toHaveLength(0); expect(s.dock.style.visibility).toBe("");
  });
  it("图片加载失败时仍显示原图标，操作不受影响", async () => {
    const s = await setup({ broken: true }); await Promise.resolve(); s.start();
    expect(s.actor.hidden).toBe(true); expect(s.dock.style.visibility).toBe(""); expect(s.handlers.size).toBe(0); s.cleanup();
  });
});
