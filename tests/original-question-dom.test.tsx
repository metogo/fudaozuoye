// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { OriginalQuestion } from "@/components/original-question";
import type { ChatMessage, ProblemSnapshot } from "@/lib/learning/types";

const message: ChatMessage = { id: "q", role: "user", kind: "user", text: "求三角形面积。", createdAt: "2026-09-10" };
afterEach(cleanup);
describe("原题折叠入口", () => {
  const problem = { text: "已知三角形底为8厘米，高为3厘米，求面积。", childWork: "8+3=11", visualContext: { related: true, summary: "三角形底边水平", facts: [{ text: "底边标注8厘米", source: "printed_label", confidence: 1 }] } } as ProblemSnapshot;
  it("旧图片会话原图丢失时展示识别题干、图中条件和已有作答，不冒充找回原图", async () => {
    render(<OriginalQuestion message={{ ...message, text: "这道题我不会，想把它学懂。" }} problem={problem}/>);
    await userEvent.click(screen.getByRole("button", { name: "查看原题" }));
    expect(await screen.findByText(problem.text)).not.toBeNull();
    expect(screen.getByText("底边标注8厘米")).not.toBeNull();
    expect(screen.getByText("8+3=11")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("原图在当前浏览器不可用");
    expect(screen.queryByText("这道题我不会，想把它学懂。")).toBeNull();
  });
  it("图片链接失效后显示题干，随后恢复有效图片时仍可看图", async () => {
    const photo = { ...message, imageUrl: "blob:old", imageAssetId: "asset" };
    const view = render(<OriginalQuestion message={photo} problem={problem}/>);
    await userEvent.click(screen.getByRole("button", { name: "查看原题" }));
    fireEvent.error(screen.getByRole("img", { name: "学生发送的题目" }));
    expect(await screen.findByText(problem.text)).not.toBeNull();
    view.rerender(<OriginalQuestion message={{ ...photo, imageUrl: "blob:restored" }} problem={problem}/>);
    expect(screen.getByRole("img", { name: "学生发送的题目" }).getAttribute("src")).toBe("blob:restored");
    expect(screen.queryByText(problem.text)).toBeNull();
  });
  it("键盘 Enter/空格可展开收起，控制的内容区域对应真实 id", async () => {
    const user = userEvent.setup();
    render(<OriginalQuestion message={message}/>);
    const button = screen.getByRole("button", { name: "查看原题" });
    const content = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(content.hidden).toBe(true);
    await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    expect(content.hidden).toBe(false);
    expect(screen.getByText(message.text)).not.toBeNull();
    await user.keyboard(" ");
    expect(content.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });
  it("新题以新的 key 挂载后恢复折叠，不沿用上一题展开状态", async () => {
    const user = userEvent.setup();
    const view = render(<OriginalQuestion key="q" message={message}/>);
    await user.click(screen.getByRole("button", { name: "查看原题" }));
    view.rerender(<OriginalQuestion key="q2" message={{ ...message, id: "q2", text: "另一道题" }}/>);
    expect(screen.getByRole("button", { name: "查看原题" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(message.text)).toBeNull();
    expect(screen.queryByText("另一道题")).toBeNull();
  });
});
