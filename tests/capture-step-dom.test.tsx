// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureStep } from "@/components/capture-step";

const providers = [
  { id: "doubao", label: "豆包", available: true },
  { id: "openai", label: "OpenAI", available: true },
];

describe("拍题首页", () => {
  afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); });

  it("明确展示准备状态，并让用户选择可用模型", () => {
    const onProvider = vi.fn();
    render(<CaptureStep providers={providers as never} provider="doubao" ready={false} onProvider={onProvider} onFile={vi.fn()}/>);
    expect(screen.getByText("AI 服务正在准备，请稍候")).not.toBeNull();
    const inputs = document.querySelectorAll('input[type="file"]');
    expect(inputs).toHaveLength(2);
    expect((inputs[0] as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    expect(onProvider).toHaveBeenCalledWith("openai");
    expect(screen.getByText("已切换到 OpenAI")).not.toBeNull();
  });

  it("只接收 20MB 内的图片，并把错误留在当前界面", () => {
    const onFile = vi.fn();
    render(<CaptureStep providers={providers as never} provider="doubao" ready onProvider={vi.fn()} onFile={onFile}/>);
    const [camera] = Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
    const tooLarge = new File([new Uint8Array(1)], "large.png", { type: "image/png" });
    Object.defineProperty(tooLarge, "size", { value: 21 * 1024 * 1024 });
    fireEvent.change(camera, { target: { files: [tooLarge] } });
    expect(screen.getByText("图片不能超过 20MB")).not.toBeNull();
    const text = new File(["text"], "answer.txt", { type: "text/plain" });
    fireEvent.change(camera, { target: { files: [text] } });
    expect(screen.getByText("请选择图片文件")).not.toBeNull();
    const image = new File(["image"], "answer.png", { type: "image/png" });
    fireEvent.change(camera, { target: { files: [image] } });
    expect(onFile).toHaveBeenCalledWith(image);
  });

  it("下拉到阈值后给出换一句的明确反馈", () => {
    render(<CaptureStep providers={providers as never} provider="doubao" ready onProvider={vi.fn()} onFile={vi.fn()}/>);
    const main = document.querySelector("main")!;
    fireEvent.touchStart(main, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(main, { touches: [{ clientY: 120 }], cancelable: true });
    expect(screen.getByRole("status").textContent).toContain("松开，换一句");
    fireEvent.touchEnd(main);
  });
});
