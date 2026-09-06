import { describe, expect, it } from "vitest";
import { quoteComposerPosition } from "@/lib/learning/quote-composer-position";

const base = { viewportLeft: 0, viewportTop: 0, viewportWidth: 390, viewportHeight: 844, dockLeft: 0, dockWidth: 390, anchorBottom: 240, height: 180 };
describe("就地引用输入框位置", () => {
  it("通常紧跟选区下方", () => {
    const p = quoteComposerPosition(base);
    expect(p.top).toBe(258); expect(p.left).toBe(12); expect(p.width).toBe(366);
  });
  it("键盘缩小可视高度后保持整个输入框可见", () => {
    const p = quoteComposerPosition({ ...base, viewportHeight: 400, anchorBottom: 360 });
    expect(p.top + base.height).toBeLessThanOrEqual(388);
  });
  it("缩放与可视区偏移不会让框越界", () => {
    const p = quoteComposerPosition({ ...base, viewportLeft: 50, viewportTop: 120, viewportWidth: 300, viewportHeight: 450, anchorBottom: 600 });
    expect(p.left).toBeGreaterThanOrEqual(62); expect(p.left + p.width).toBeLessThanOrEqual(338);
    expect(p.top + base.height).toBeLessThanOrEqual(558);
  });
  it("桌面只使用适合短问题的宽度", () => {
    expect(quoteComposerPosition({ ...base, viewportWidth: 1280, dockLeft: 256, dockWidth: 768 }).width).toBe(520);
  });
});
