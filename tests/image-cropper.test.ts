import { describe, expect, it } from "vitest";
import { resizeCropFromCorner, type Crop } from "@/components/image-cropper";

const crop: Crop = { x: 20, y: 20, width: 60, height: 60 };

describe("图片四角裁剪", () => {
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
