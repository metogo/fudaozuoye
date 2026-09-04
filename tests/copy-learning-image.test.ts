import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkLearningImageSize, copyLearningImage } from "../lib/learning/copy-learning-image";

const render = vi.hoisted(() => ({ toBlob: vi.fn(), getFontEmbedCSS: vi.fn() }));
vi.mock("html-to-image", () => render);
beforeEach(() => {
  render.toBlob.mockReset().mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  render.getFontEmbedCSS.mockReset().mockResolvedValue("");
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function fixture() {
  const computed = Object.assign(["font-size", "width"], { getPropertyValue: () => "16.333px" });
  const source = {
    clientWidth: 300, scrollWidth: 300, scrollHeight: 600,
    closest: () => null,
    style: { setProperty: vi.fn() }, setAttribute: vi.fn(), remove: vi.fn(),
    querySelectorAll: () => [], querySelector: () => null,
    ownerDocument: {
      fonts: { ready: Promise.resolve() }, body: { appendChild: vi.fn() },
      defaultView: { getComputedStyle: () => computed },
    },
    getBoundingClientRect: () => ({ width: 300 }),
    cloneNode: () => ({ ...source, style: { setProperty: vi.fn() } }),
  } as unknown as HTMLElement;
  return source;
}

class ClipboardItemMock {
  constructor(public data: Record<string, Promise<Blob>>) {}
}

describe("完整讲解图片复制", () => {
  it("常规手机长文保持2倍清晰度预算", () => {
    expect(() => checkLearningImageSize(318, 3194)).not.toThrow();
  });
  it("长宽及像素超限直接拒绝，不偷偷缩放或截断", () => {
    for (const [width, height] of [[300, 9000], [9000, 300], [4000, 4000]]) {
      expect(() => checkLearningImageSize(width, height)).toThrow("无法完整");
    }
  });
  it("空或非数字正文尺寸拒绝", () => {
    expect(() => checkLearningImageSize(0, 300)).toThrow("尺寸无效");
    expect(() => checkLearningImageSize(300, NaN)).toThrow("尺寸无效");
  });
  it("不支持图片剪贴板时不降级成文本", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyLearningImage({} as HTMLElement)).rejects.toThrow("不支持复制图片");
    expect(writeText).not.toHaveBeenCalled();
  });
  it("横向溢出的公式明确拒绝，避免产生残缺图片", async () => {
    const write = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal("ClipboardItem", class {});
    const source = Object.assign(fixture(), { scrollWidth: 450 });
    await expect(copyLearningImage(source)).rejects.toThrow("超出正文宽度");
    expect(write).not.toHaveBeenCalled();
  });
  it("KaTeX的隐藏辅助树溢出不算图片裁剪", async () => {
    vi.stubGlobal("navigator", { clipboard: { write: (items: ClipboardItemMock[]) => items[0].data["image/png"] } });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    const hidden = { clientWidth: 1, scrollWidth: 124, closest: () => ({}) };
    const source = Object.assign(fixture(), { querySelectorAll: () => [hidden] });
    await expect(copyLearningImage(source)).resolves.toBeUndefined();
    expect(render.toBlob).toHaveBeenCalledOnce();
  });
  it("同步发起写入，图片完整生成后才报告成功", async () => {
    const write = vi.fn(async (items: ClipboardItemMock[]) => {
      expect(items[0].data["image/png"]).toBeInstanceOf(Promise);
      expect((await items[0].data["image/png"]).type).toBe("image/png");
    });
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    const completion = copyLearningImage(fixture());
    expect(write).toHaveBeenCalledOnce();
    await completion;
    expect(render.toBlob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      width: 332, height: 632, pixelRatio: 2, skipAutoScale: true, includeStyleProperties: ["width"],
    }));
  });
  it("字体长期未就绪时30秒后失败，不在稍后偷偷复制", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { clipboard: { write: (items: ClipboardItemMock[]) => items[0].data["image/png"] } });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    const source = fixture();
    let ready!: () => void;
    Object.assign(source.ownerDocument.fonts, { ready: new Promise<void>((resolve) => { ready = resolve; }) });
    const completion = expect(copyLearningImage(source)).rejects.toThrow("生成超时");
    await vi.advanceTimersByTimeAsync(30_000);
    await completion;
    ready();
    await vi.advanceTimersByTimeAsync(1);
    expect(render.toBlob).not.toHaveBeenCalled();
    expect(source.remove).toHaveBeenCalledOnce();
  });
  it("返回HTML等伪字体数据时不生成损坏图片", async () => {
    vi.stubGlobal("navigator", { clipboard: { write: (items: ClipboardItemMock[]) => items[0].data["image/png"] } });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    vi.stubGlobal("FontFace", class { load() { return Promise.reject(new Error("invalid font")); } });
    render.getFontEmbedCSS.mockResolvedValue('@font-face {src: url("data:text/html;base64,PGh0bWw+")}');
    await expect(copyLearningImage(fixture())).rejects.toThrow("字体无法解码");
    expect(render.toBlob).not.toHaveBeenCalled();
  });
  it("浏览器写入挂起也必须反馈图片生成失败", async () => {
    vi.stubGlobal("navigator", { clipboard: { write: () => new Promise(() => {}) } });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    render.toBlob.mockRejectedValue(new Error("图片渲染失败"));
    await expect(copyLearningImage(fixture())).rejects.toThrow("图片渲染失败");
  });
  it("异步等待期间原正文变化不会替换已经选定的内容", async () => {
    vi.stubGlobal("navigator", { clipboard: { write: (items: ClipboardItemMock[]) => items[0].data["image/png"] } });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    const source = fixture();
    source.textContent = "原讲解 A";
    let ready!: () => void;
    Object.assign(source.ownerDocument.fonts, { ready: new Promise<void>((resolve) => { ready = resolve; }) });
    const completion = copyLearningImage(source);
    source.textContent = "新讲解 B";
    ready();
    await completion;
    expect(render.toBlob.mock.calls[0][0]).not.toBe(source);
    expect(render.toBlob.mock.calls[0][0].textContent).toBe("原讲解 A");
  });
  it("图片写入权限被拒绝，不假报成功", async () => {
    vi.stubGlobal("navigator", { clipboard: { write: vi.fn().mockRejectedValue(new Error("denied")) } });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    await expect(copyLearningImage(fixture())).rejects.toThrow("denied");
  });
  it("字体与图片生成失败必须向上传递", async () => {
    vi.stubGlobal("navigator", { clipboard: { write: (items: ClipboardItemMock[]) => items[0].data["image/png"] } });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    render.getFontEmbedCSS.mockResolvedValue('@font-face {src: url("")}');
    await expect(copyLearningImage(fixture())).rejects.toThrow("字体加载失败");
    render.getFontEmbedCSS.mockResolvedValue("");
    render.toBlob.mockResolvedValue(null);
    await expect(copyLearningImage(fixture())).rejects.toThrow("图片生成失败");
  });
});
