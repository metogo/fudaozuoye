// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteComposerMotion } from "@/components/quote-composer-motion";
function Harness({ range }: { range: Range | null }) { const form = createRef<HTMLFormElement>(), dock = createRef<HTMLDivElement>(), scroll = createRef<HTMLDivElement>(); return <><div ref={scroll}><span id="quoted">选中内容</span></div><div ref={dock}><form ref={form}/></div><QuoteComposerMotion range={range} formRef={form} dockRef={dock} scrollRef={scroll}/></>; }
describe("QuoteComposerMotion", () => { beforeEach(() => { Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class { observe() {} disconnect() {} } }); vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 1; }); vi.stubGlobal("cancelAnimationFrame", vi.fn()); Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true }) }); vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { const id = this.id; return { left: 10, top: id === "quoted" ? 100 : 0, width: 300, height: 40, right: 310, bottom: id === "quoted" ? 120 : 40, x: 10, y: 0, toJSON() { return {}; } } as DOMRect; }); }); afterEach(() => vi.restoreAllMocks());
 it("引用时建立遮罩，取消时同步清理定位状态", () => { const view = render(<Harness range={null}/>); const text = document.querySelector("#quoted")!; const range = { startContainer: text, getClientRects: () => [{ left: 20, top: 100, width: 80, height: 20, bottom: 120 }] } as unknown as Range; view.rerender(<Harness range={range}/>); expect(document.querySelector(".quote-selection-overlay")).not.toBeNull(); expect(document.querySelector("form")?.classList.contains("chat-composer--quoted")).toBe(true); view.rerender(<Harness range={null}/>); expect(document.querySelector(".quote-selection-overlay")).toBeNull(); expect(document.querySelector("form")?.classList.contains("chat-composer--quoted")).toBe(false); });
 it("可动效模式会连线选区与输入框，并在滚动或视口变化时重新定位", () => {
   const events: Record<string, () => void> = {};
   const viewport = { offsetLeft: 0, offsetTop: 0, width: 360, height: 480, addEventListener: vi.fn((name: string, cb: () => void) => { events[name] = cb; }), removeEventListener: vi.fn() };
   Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
   Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
   const animate = vi.fn(() => ({ cancel: vi.fn() }));
   Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
   const view = render(<Harness range={null}/>);
   const form = document.querySelector("form")!;
   Object.defineProperty(form, "offsetHeight", { configurable: true, value: 44 });
   const range = { get startContainer() { return document.querySelector("#quoted")!; }, getClientRects: () => [{ left: 20, top: 100, width: 80, height: 20, bottom: 120 }] } as unknown as Range;
   view.rerender(<Harness range={range}/>);
   expect(document.querySelector(".quote-selection-overlay")).not.toBeNull();
   fireEvent.scroll(document.querySelector("#quoted")!.parentElement!);
   events.resize?.(); events.scroll?.();
   view.rerender(<Harness range={null}/>);
   expect(animate).toHaveBeenCalled();
 });
});
