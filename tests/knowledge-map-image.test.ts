import { describe, expect, it } from "vitest";
import { mapImageFrame } from "@/lib/learning/knowledge-map-image";
import { knowledgeMapEdges } from "@/components/knowledge-map-edges";

describe("完整图谱图片范围", () => {
  it("包括负坐标和屏幕外的节点，保留边缘留白与标题页脚", () => {
    const frame = mapImageFrame([{ x: -500, y: -120, width: 194, height: 140 }, { x: 700, y: 500, width: 194, height: 140 }]);
    expect(frame.width).toBe(1490);
    expect(frame.height).toBe(856);
    expect(frame.sheetHeight).toBe(968);
    expect(frame.viewport).toEqual({ x: 548, y: 168, zoom: 1 });
    expect(frame.pixelRatio).toBe(2);
  });
  it("较宽图谱限制像素和手机内存，但不会裁掉节点", () => {
    const frame = mapImageFrame([{ x: 0, y: 0, width: 3700, height: 500 }]);
    expect(frame.width * frame.pixelRatio).toBeLessThanOrEqual(4096);
    expect(frame.width * frame.sheetHeight * frame.pixelRatio ** 2).toBeLessThanOrEqual(12_000_000);
    expect(frame.pixelRatio).toBeGreaterThan(1);
  });
  it("只生成根节点时仍居中导出", () => {
    const frame = mapImageFrame([{ x: -100, y: 0, width: 194, height: 136 }]);
    expect(frame.viewport.x - 100 + 194 / 2).toBe(frame.width / 2);
  });
  it("空图、未测量和过度分散的布局明确报错，不能导出空白或不可读图片", () => {
    expect(() => mapImageFrame([])).toThrow();
    expect(() => mapImageFrame([{ x: 0, y: 0, width: 0, height: 120 }])).toThrow();
    expect(() => mapImageFrame([{ x: 0, y: NaN, width: 194, height: 120 }])).toThrow();
    expect(() => mapImageFrame([{ x: -200000, y: 0, width: 194, height: 120 }, { x: 200000, y: 0, width: 194, height: 120 }])).toThrow("整理");
  });
  it("导出连线沿用图谱箭头与关系标签，所有关系都正常显示", () => {
    const edges = knowledgeMapEdges([{ from: "core", to: "base", kind: "prerequisite", reason: "需要这个基础" }, { from: "base", to: "next", kind: "application", reason: "结合使用" }]);
    expect(edges).toHaveLength(2);
    expect(edges.every(e => e.type === "smoothstep" && e.markerEnd && e.label && e.style?.opacity === 1)).toBe(true);
  });
});
