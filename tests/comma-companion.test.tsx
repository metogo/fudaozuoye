import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CommaCompanion } from "@/components/comma-companion";

describe("小顿号图标资源", () => {
  it("每个界面状态都有实际可解码的透明图片，而非只有引用", async () => {
    let total = 0;
    for (const pose of ["idle", "thinking", "ready"]) {
      const bytes = readFileSync(`public/brand/comma-${pose}.webp`);
      total += bytes.length;
      const meta = await sharp(bytes).metadata();
      expect([meta.width, meta.height, meta.hasAlpha]).toEqual([192, 192, true]);
      const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
      expect(data[3]).toBe(0);
      expect(data[(96 * 192 + 96) * 4 + 3]).toBe(255);
    }
    expect(total).toBeLessThan(70_000);
  });
  it("默认静止，等待态显式切换，三张图片不重复朗读", () => {
    const idle = renderToStaticMarkup(<CommaCompanion/>);
    const thinking = renderToStaticMarkup(<CommaCompanion thinking/>);
    expect(idle).toContain('data-state="idle"');
    expect(thinking).toContain('data-state="thinking"');
    expect(idle.match(/aria-hidden="true"/g)).toHaveLength(3);
    expect(idle).toContain('aria-label="专注作业"');
  });
});
