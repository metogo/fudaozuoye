// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageCropper } from "@/components/image-cropper";

class Reader {
  result: string | null = "data:image/png;base64,question";
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  readAsDataURL() { this.onload?.({} as ProgressEvent<FileReader>); }
  abort() {}
}

describe("题目裁剪器", () => {
  beforeEach(() => {
    vi.stubGlobal("FileReader", Reader);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    vi.stubGlobal("Image", class { naturalWidth = 400; naturalHeight = 200; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { this.onload?.(); } });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,rotated");
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["crop"], { type: "image/jpeg" })));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("读取图片后提供四角键盘微调、重置和预览往返", async () => {
    render(<ImageCropper file={new File(["image"], "question.png", { type: "image/png" })} onConfirm={vi.fn()} onCancel={vi.fn()}/>);
    const image = await screen.findByAltText("待裁剪的作业照片");
    expect(image.getAttribute("src")).toContain("data:image/png");
    const corner = screen.getByRole("button", { name: "拖动左上角调整裁剪范围" });
    fireEvent.keyDown(corner, { key: "ArrowRight", shiftKey: true });
    await waitFor(() => expect(document.querySelector("[data-full-image]")?.getAttribute("data-full-image")).toBe("false"));
    fireEvent.click(screen.getByRole("button", { name: "重置裁剪区域" }));
    expect(document.querySelector("[data-full-image]")?.getAttribute("data-full-image")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /放大查看/ }));
    expect(screen.getByRole("dialog", { name: "放大查看图片" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    expect(screen.getByRole("button", { name: "缩小" }).hasAttribute("disabled")).toBe(false);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "放大查看图片" })).toBeNull();
  });

  it("取消操作不会隐式确认或处理图片", async () => {
    const cancel = vi.fn();
    const confirm = vi.fn();
    render(<ImageCropper file={new File(["image"], "question.png", { type: "image/png" })} onConfirm={confirm} onCancel={cancel} confirmLabel="开始识别"/>);
    await screen.findByAltText("待裁剪的作业照片");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "开始识别" }).hasAttribute("disabled")).toBe(false);
  });

  it("可旋转后确认裁剪，并在画布不可用时给出错误", async () => {
    const confirm = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:crop") });
    const view = render(<ImageCropper file={new File(["image"], "question.png", { type: "image/png" })} onConfirm={confirm} onCancel={vi.fn()}/>);
    const image = await screen.findByAltText("待裁剪的作业照片");
    fireEvent.click(screen.getByRole("button", { name: /旋转90/ }));
    await waitFor(() => expect(image.getAttribute("src")).toContain("rotated"));
    fireEvent.click(screen.getByRole("button", { name: "裁剪并识别" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.any(Blob), "blob:crop"));
    view.unmount();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValueOnce(null);
    render(<ImageCropper file={new File(["image"], "again.png", { type: "image/png" })} onConfirm={vi.fn()} onCancel={vi.fn()}/>);
    await screen.findByAltText("待裁剪的作业照片");
    fireEvent.click(screen.getByRole("button", { name: "裁剪并识别" }));
    expect((await screen.findByRole("alert")).textContent).toContain("当前浏览器无法处理图片");
  });

  it("拖动裁剪框、四角与放大预览时，范围和预览状态都可恢复", async () => {
    render(<ImageCropper file={new File(["image"], "question.png", { type: "image/png" })} onConfirm={vi.fn()} onCancel={vi.fn()}/>);
    await screen.findByAltText("待裁剪的作业照片");
    const cropBox = document.querySelector(".crop-box") as HTMLDivElement;
    vi.spyOn(cropBox.parentElement!, "getBoundingClientRect").mockReturnValue({ width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(cropBox, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(cropBox.parentElement!, { pointerId: 1, clientX: 100, clientY: 40 });
    fireEvent.pointerUp(cropBox.parentElement!, { pointerId: 1 });
    await waitFor(() => expect(cropBox.getAttribute("data-full-image")).toBe("false"));
    const southeast = screen.getByRole("button", { name: "拖动右下角调整裁剪范围" });
    fireEvent.pointerDown(southeast, { pointerId: 2, clientX: 100, clientY: 40 });
    fireEvent.pointerMove(cropBox.parentElement!, { pointerId: 2, clientX: 140, clientY: 80 });
    fireEvent.pointerCancel(cropBox.parentElement!, { pointerId: 2 });
    fireEvent.click(screen.getByRole("button", { name: /放大查看/ }));
    const dialog = screen.getByRole("dialog", { name: "放大查看图片" });
    const area = dialog.querySelector(".flex.min-h-0") as HTMLDivElement;
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 300, height: 240 } as DOMRect);
    Object.defineProperties(area, { clientWidth: { value: 300 }, clientHeight: { value: 240 } });
    fireEvent.pointerDown(area, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(area, { pointerId: 1, clientX: 80, clientY: 70 });
    fireEvent.pointerDown(area, { pointerId: 2, clientX: 160, clientY: 50 });
    fireEvent.pointerMove(area, { pointerId: 2, clientX: 220, clientY: 50 });
    fireEvent.pointerUp(area, { pointerId: 1 });
    fireEvent.pointerCancel(area, { pointerId: 2 });
    fireEvent.click(screen.getByRole("button", { name: "恢复适应屏幕" }));
    expect(screen.getByRole("button", { name: "缩小" }).hasAttribute("disabled")).toBe(true);
  });

  it("放大预览会约束拖动、支持双指缩放和键盘焦点循环", async () => {
    render(<ImageCropper file={new File(["image"], "question.png", { type: "image/png" })} onConfirm={vi.fn()} onCancel={vi.fn()}/>);
    await screen.findByAltText("待裁剪的作业照片");
    fireEvent.click(screen.getByRole("button", { name: /放大查看/ }));
    const dialog = screen.getByRole("dialog", { name: "放大查看图片" });
    const area = dialog.querySelector(".flex.min-h-0") as HTMLDivElement;
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 300, height: 240 } as DOMRect);
    Object.defineProperties(area, { clientWidth: { configurable: true, value: 300 }, clientHeight: { configurable: true, value: 240 } });
    fireEvent.pointerMove(area, { pointerId: 99, clientX: 1, clientY: 1 });
    fireEvent.pointerDown(area, { pointerId: 1, clientX: 30, clientY: 30 });
    fireEvent.pointerDown(area, { pointerId: 2, clientX: 100, clientY: 30 });
    fireEvent.pointerMove(area, { pointerId: 2, clientX: 190, clientY: 30 });
    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    expect(screen.getByRole("button", { name: "缩小" }).hasAttribute("disabled")).toBe(false);
    const back = screen.getByRole("button", { name: "返回裁剪" });
    back.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "放大" }));
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(back);
    fireEvent.pointerUp(area, { pointerId: 1 });
    fireEvent.pointerCancel(area, { pointerId: 2 });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "放大查看图片" })).toBeNull();
  });

  it("图片读取和旋转失败会保留页面并给出可理解的重试提示", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValueOnce("data:,");
    render(<ImageCropper file={new File(["image"], "question.png", { type: "image/png" })} onConfirm={vi.fn()} onCancel={vi.fn()}/>);
    await screen.findByAltText("待裁剪的作业照片");
    fireEvent.click(screen.getByRole("button", { name: /旋转90/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("图片太大");
  });

  it("读取、解码和压缩失败都留在裁剪页，并允许用户取消返回", async () => {
    class BrokenReader extends Reader { readAsDataURL() { this.onerror?.({} as ProgressEvent<FileReader>); } }
    vi.stubGlobal("FileReader", BrokenReader);
    const cancel = vi.fn();
    const first = render(<ImageCropper file={new File(["image"], "broken.png", { type: "image/png" })} onConfirm={vi.fn()} onCancel={cancel}/>);
    expect((await screen.findByRole("alert")).textContent).toContain("照片读取失败");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    first.unmount();

    vi.stubGlobal("FileReader", Reader);
    vi.stubGlobal("Image", class { naturalWidth = 400; naturalHeight = 200; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { this.onerror?.(); } });
    const invalid = render(<ImageCropper file={new File(["image"], "invalid.png", { type: "image/png" })} onConfirm={vi.fn()} onCancel={vi.fn()}/>);
    await screen.findByAltText("待裁剪的作业照片");
    fireEvent.click(screen.getByRole("button", { name: /旋转90/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("图片格式无法读取");
    invalid.unmount();
    vi.stubGlobal("Image", class { naturalWidth = 400; naturalHeight = 200; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { this.onload?.(); } });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementationOnce((callback) => callback(null));
    render(<ImageCropper file={new File(["image"], "compress.png", { type: "image/png" })} onConfirm={vi.fn()} onCancel={vi.fn()}/>);
    await screen.findByAltText("待裁剪的作业照片");
    fireEvent.click(screen.getByRole("button", { name: "裁剪并识别" }));
    expect((await screen.findByRole("alert")).textContent).toContain("图片压缩失败");
  });
});
