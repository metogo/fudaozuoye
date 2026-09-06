import { describe, expect, it } from "vitest";
import { rotateCropClockwise, zoomPreviewAt } from "@/components/image-cropper";

describe("裁剪区域几何计算", () => {
  it("顺时针旋转时保持区域覆盖同一图像内容", () => {
    expect(rotateCropClockwise({ x: 10, y: 20, width: 30, height: 40 })).toEqual({ x: 40, y: 10, width: 40, height: 30 });
  });

  it("缩放以手势中心为锚点并限制在可理解范围", () => {
    expect(zoomPreviewAt({ scale: 1, x: 0, y: 0 }, 3, 10, -20)).toEqual({ scale: 3, x: -20, y: 40 });
    expect(zoomPreviewAt({ scale: 2, x: 30, y: 40 }, 0.2, 10, 10)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(zoomPreviewAt({ scale: 2, x: 0, y: 0 }, 10, 0, 0).scale).toBe(6);
  });
});
