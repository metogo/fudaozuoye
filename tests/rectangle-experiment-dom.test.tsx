// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RectangleExperiment } from "@/components/rectangle-experiment";
import { UiLanguageProvider, UiLanguageSwitch } from "@/components/ui-language";

afterEach(() => { cleanup(); localStorage.clear(); });
const open = () => fireEvent.click(screen.getByRole("button", { name: /拖一拖/ }));
describe("小实验完整交互", () => {
  it("默认折叠，不产生请求；自主展开后才呈现独立示例", () => {
    const ask = vi.fn(); render(<RectangleExperiment disabled={false} onAsk={ask}/>);
    expect(screen.queryByRole("slider")).toBeNull();
    open();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("长 4 厘米，宽 2 厘米");
    expect(screen.getByText(/独立知识实验/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /带着观察/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
  it("图形与计算同步，固定周长约束生效，收起后保留观察并恢复焦点", () => {
    render(<RectangleExperiment disabled={false} onAsk={vi.fn()}/>); open();
    fireEvent.click(screen.getByRole("button", { name: /保持周长不变/ }));
    expect((screen.getByRole("slider", { name: "实验长方形的宽" }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("slider", { name: "实验长方形的长" }), { target: { value: "5" } });
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("长 5 厘米，宽 1 厘米");
    expect(document.querySelector(".experiment-shape")?.getAttribute("width")).toBe("120");
    expect(document.querySelector(".experiment-shape")?.getAttribute("height")).toBe("24");
    fireEvent.click(screen.getByRole("button", { name: "收起实验，继续看题" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /拖一拖/ }));
    open(); expect(screen.getByRole("img").getAttribute("aria-label")).toContain("长 5 厘米");
    fireEvent.keyDown(screen.getByRole("slider", { name: "实验长方形的长" }), { key: "Escape" });
    expect(screen.queryByRole("slider")).toBeNull();
  });
  it("带上本轮观察追问，只调用一次，不把操作当作作答", () => {
    const ask = vi.fn(); const view = render(<RectangleExperiment disabled={false} onAsk={ask}/>); open();
    fireEvent.change(screen.getByRole("slider", { name: "实验长方形的长" }), { target: { value: "6" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "这个关系怎么用回原题？" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toContain("面积从8平方厘米变为12平方厘米");
    expect(ask.mock.calls[0][0]).toContain("这个关系怎么用回原题？");
    expect(screen.queryByRole("slider")).toBeNull();
    view.rerender(<RectangleExperiment disabled onAsk={ask}/>);
    open(); expect(screen.queryByRole("slider")).toBeNull();
  });
  it("重置恢复起点和约束，新题重新挂载时不继承旧观察", () => {
    const view = render(<RectangleExperiment key="one" disabled={false} onAsk={vi.fn()}/>); open();
    fireEvent.change(screen.getByRole("slider", { name: "实验长方形的长" }), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /保持周长不变/ }));
    fireEvent.click(screen.getByRole("button", { name: "重新观察" }));
    expect(screen.getByRole("button", { name: /保持周长不变/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("长 4 厘米");
    view.rerender(<RectangleExperiment key="two" disabled={false} onAsk={vi.fn()}/>);
    expect(screen.queryByRole("slider")).toBeNull();
  });
  it("固定周长的整数边界明确提示如何继续，不假装滑块还能改变形状", () => {
    render(<RectangleExperiment disabled={false} onAsk={vi.fn()}/>); open();
    fireEvent.change(screen.getByRole("slider", { name: "实验长方形的长" }), { target: { value: "8" } });
    fireEvent.change(screen.getByRole("slider", { name: "实验长方形的宽" }), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: /保持周长不变/ }));
    expect(screen.getByText(/当前整数范围内只有这一种形状/)).toBeTruthy();
    expect(screen.getByRole("textbox").getAttribute("maxlength")).toBe("100");
    expect(document.querySelector(".rectangle-experiment")?.hasAttribute("data-selection-exclude")).toBe(true);
  });
  it("支持英文界面，不翻译或改写给模型的中文上下文", () => {
    const ask = vi.fn(); render(<UiLanguageProvider><UiLanguageSwitch/><RectangleExperiment disabled={false} onAsk={ask}/></UiLanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "English interface" }));
    fireEvent.click(screen.getByRole("button", { name: /Explore perimeter and area/ }));
    fireEvent.change(screen.getByRole("slider", { name: "Example rectangle length" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Ask Comma about this/ }));
    expect(ask.mock.calls[0][0]).toContain("不是原题条件");
  });
});
