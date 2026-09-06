import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageCropper, resizeCropFromCorner, rotateCropClockwise, zoomPreviewAt, type Crop } from "@/components/image-cropper";

const crop: Crop = { x: 20, y: 20, width: 60, height: 60 };

describe("图片四角裁剪", () => {
  it("默认全选，显示高对比四角和独立查看、旋转入口", () => {
    const html = renderToStaticMarkup(createElement(ImageCropper, { file: new File([], "test.png"), onConfirm: () => {}, onCancel: () => {} }));
    expect(html).toContain("left:0%;top:0%;width:100%;height:100%");
    expect(html).toContain("border-amber-300");
    expect(html).toContain("-top-3");
    expect(html).toContain("-bottom-3");
    expect(html).toContain("放大查看");
    expect(html).toContain("旋转90°");
  });

  it("旋转选框保持同一块内容，四次旋转恢复原范围", () => {
    const asymmetric = { x: 10, y: 20, width: 30, height: 40 };
    expect(rotateCropClockwise(asymmetric)).toEqual({ x: 40, y: 10, width: 40, height: 30 });
    let result = asymmetric;
    for (let i = 0; i < 4; i++) result = rotateCropClockwise(result);
    expect(result).toEqual(asymmetric);
    expect(rotateCropClockwise({ x: 0, y: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("预览缩放以手势中心为锚点，限制倍数并在复位时清除平移", () => {
    expect(zoomPreviewAt({ scale: 1, x: 0, y: 0 }, 2, 40, 20)).toEqual({ scale: 2, x: -40, y: -20 });
    expect(zoomPreviewAt({ scale: 2, x: -40, y: -20 }, 1, 40, 20)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(zoomPreviewAt({ scale: 1, x: 0, y: 0 }, 20, 0, 0).scale).toBe(6);
  });
  it.each([
    ["north-west", -10, -5, { x: 10, y: 15, width: 70, height: 65 }],
    ["north-east", 10, -5, { x: 20, y: 15, width: 70, height: 65 }],
    ["south-west", -10, 5, { x: 10, y: 20, width: 70, height: 65 }],
    ["south-east", 10, 5, { x: 20, y: 20, width: 70, height: 65 }],
  ] as const)("允许从 %s 独立调整两条边", (handle, dx, dy, expected) => {
    expect(resizeCropFromCorner(crop, handle, dx, dy)).toEqual(expected);
  });

  it("不会越过图片边界或缩小到不可操作", () => {
    expect(resizeCropFromCorner(crop, "north-west", -100, -100)).toEqual({ x: 0, y: 0, width: 80, height: 80 });
    expect(resizeCropFromCorner(crop, "south-east", 100, 100)).toEqual({ x: 20, y: 20, width: 80, height: 80 });
    expect(resizeCropFromCorner(crop, "north-west", 100, 100)).toEqual({ x: 65, y: 68, width: 15, height: 12 });
  });
});
