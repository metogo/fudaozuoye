// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReportFile } from "@/lib/learning/report";

const session = {
  problem: { gradeBand: "junior", subject: "math" },
  nodes: [
    { kind: "concept", difficulty: 2, state: "mastered", title: "判别式" },
    { kind: "concept", difficulty: 1, state: "needs_help", title: "配方法" },
    { kind: "root", difficulty: 0, state: "unchecked", title: "原题" },
  ],
  originalPassed: true,
  transferPassed: true,
};

describe("脱敏学习报告", () => {
  afterEach(() => vi.restoreAllMocks());

  it("绘制排序后的知识节点并导出 PNG 文件", async () => {
    const context = Object.fromEntries(["fillRect", "fillText", "beginPath", "arc", "fill", "roundRect", "measureText"].map((key) => [key, vi.fn()]));
    context.measureText.mockReturnValue({ width: 1 });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
    const report = await createReportFile(session as never);
    expect(report.name).toMatch(/^回溯学-学习报告-\d{4}-\d{2}-\d{2}\.png$/);
    expect(report.type).toBe("image/png");
    expect(context.fillText).toHaveBeenCalledWith("1. 配方法", 154, 511);
    expect(context.fillText).toHaveBeenCalledWith("2. 判别式", 154, 637);
    expect(context.fillText).toHaveBeenCalledWith("✓ 原题与迁移题均已通过", 74, 757);
  });

  it("在无法取得画布上下文或图片失败时给出明确错误", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(createReportFile(session as never)).rejects.toThrow("当前浏览器无法生成学习报告");
    const context = Object.fromEntries(["fillRect", "fillText", "beginPath", "arc", "fill", "roundRect", "measureText"].map((key) => [key, vi.fn()]));
    context.measureText.mockReturnValue({ width: 1 });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
    await expect(createReportFile(session as never)).rejects.toThrow("报告图片生成失败");
  });

  it("为不同学习状态标出不同颜色，并在尚未验收时生成脱敏结语", async () => {
    const context = Object.fromEntries(["fillRect", "fillText", "beginPath", "arc", "fill", "roundRect", "measureText"].map((key) => [key, vi.fn()]));
    context.measureText.mockImplementation((text: string) => ({ width: text.length > 24 ? 2_000 : 1 }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
    await createReportFile({
      ...session,
      nodes: [
        { kind: "concept", difficulty: 1, state: "known", title: "已知" },
        { kind: "concept", difficulty: 2, state: "parent_confirmed", title: "确认" },
        { kind: "concept", difficulty: 3, state: "unchecked", title: "待确认" },
      ],
      originalPassed: false,
      transferPassed: false,
    } as never);
    expect(context.fillText).toHaveBeenCalledWith("本次学习尚未完成客观验收", 74, 883);
    expect(context.fillText.mock.calls.some(([text]) => String(text).includes("报告已自动脱敏"))).toBe(true);
    expect(context.fillStyle).toBe("#78716c");
  });
});
