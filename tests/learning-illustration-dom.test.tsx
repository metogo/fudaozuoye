// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/rich-learning-text", () => ({ RichLearningText: ({ text }: any) => <>{text}</> }));
vi.mock("@/components/teaching-scene", () => ({ TeachingScene: ({ alt }: any) => <div>场景 {alt}</div> }));
import { LearningIllustration } from "@/components/learning-illustration";
const frames: any[] = [{ id: "f1", index: 1, title: "找条件", alt: "条件图", imageUrl: "https://example.com/a.png", calculation: "a=1", visualNotes: ["注意条件"] }, { id: "f2", index: 2, title: "算结果", alt: "结果图", imageUrl: "https://example.com/b.png", calculation: "$x=2$", scene: { shapes: [] } }];
describe("LearningIllustration", () => { beforeEach(() => { Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() }); }); afterEach(cleanup);
 it("可浏览帧、使用键盘关闭并重新生成", () => { const close = vi.fn(), regenerate = vi.fn(); render(<LearningIllustration lesson={{ title: "分步图", frames, frameCount: 2 } as any} frames={[]} expectedCount={2} busy={false} loadingLabel="" error="" canClose onClose={close} onRegenerate={regenerate}/>); expect(screen.getByText("找条件")).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: "下一幅" })); expect(screen.getByText("算结果")).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: "重新生成" })); expect(regenerate).toHaveBeenCalled(); fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(close).toHaveBeenCalled(); });
 it("空结果显示可行动错误与重试", () => { const regenerate = vi.fn(); render(<LearningIllustration lesson={null} frames={[]} expectedCount={0} busy={false} loadingLabel="" error="网络连接失败" canClose onClose={vi.fn()} onRegenerate={regenerate}/>); expect(screen.getByRole("alert").textContent).toContain("暂时无法连接生成服务"); fireEvent.click(screen.getByRole("button", { name: "重试" })); expect(regenerate).toHaveBeenCalled(); });
 it("生成中会解释等待状态，失效图片可在当前位置重新生成", () => {
   const regenerate = vi.fn(), close = vi.fn();
   const view = render(<LearningIllustration lesson={null} frames={[]} expectedCount={2} busy loadingLabel="" error="" canClose={false} onClose={close} onRegenerate={regenerate}/>);
   expect(screen.getByText("正在把原题拆成分步图解")).not.toBeNull();
   expect(screen.getByRole("status").textContent).toContain("正在准备图解");
   expect((screen.getByRole("button", { name: "关闭" }) as HTMLButtonElement).disabled).toBe(true);
   view.rerender(<LearningIllustration lesson={{ title: "图", frames: [frames[0]], frameCount: 1 } as any} frames={[]} expectedCount={1} busy={false} loadingLabel="" error="" canClose onClose={close} onRegenerate={regenerate}/>);
   fireEvent.error(screen.getByAltText("条件图"));
   expect(screen.getByText("这幅临时图片已失效")).not.toBeNull();
   fireEvent.click(screen.getAllByRole("button", { name: "重新生成" }).at(0)!);
   expect(regenerate).toHaveBeenCalled();
 });
 it("需要补条件的错误会保留可行动说明", () => {
   render(<LearningIllustration lesson={null} frames={[]} expectedCount={0} busy={false} loadingLabel="" error="需要补充条件：图中 AB 的长度（上次核验：obj1）" canClose onClose={vi.fn()} onRegenerate={vi.fn()}/>);
   expect(screen.getByRole("alert").textContent).toContain("还需要确认：图中 AB 的长度");
 });
});
