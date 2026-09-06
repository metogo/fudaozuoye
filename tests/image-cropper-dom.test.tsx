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
});
