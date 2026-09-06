// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
vi.mock("@/components/rich-learning-text", () => ({ RichLearningText: ({ text }: any) => <>{text}</> }));
import { AnnotationNotes, BoardSourceTrail, MarkedBoardText, sceneIntentLabel } from "@/components/board-learning-content";
import { vi } from "vitest";
describe("Board learning content", () => { afterEach(cleanup);
 it("可展开来源文本并截断过长讲解", () => { const long = "a".repeat(190); render(<BoardSourceTrail label="承接" messages={[{ id: "m", role: "assistant", text: long } as any]}/>); fireEvent.click(screen.getByRole("button", { name: "刚才的讲解" })); expect(screen.getByText(/…$/)).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: "刚才的讲解" })); expect(screen.queryByText(/…$/)).toBeNull(); });
 it("标注重点、展示说明并转换所有场景意图", () => { render(<><MarkedBoardText content="判别式 Δ=b²-4ac" annotations={[{ blockId: "b", target: "Δ=b²-4ac", reason: "关键公式", kind: "underline" } as any]}/><AnnotationNotes annotations={[{ blockId: "b", target: "Δ", reason: "划线原因", kind: "underline" } as any, { blockId: "b", target: "根", reason: "圈出原因", kind: "circle" } as any]}/></>); expect(document.querySelector("mark")?.getAttribute("title")).toBe("关键公式"); expect(screen.getByText("划线")).not.toBeNull(); expect(sceneIntentLabel("extract")).toBe("提取条件"); expect(sceneIntentLabel("connect")).toBe("连接关系"); expect(sceneIntentLabel("derive")).toBe("展开推理"); expect(sceneIntentLabel("compare")).toBe("对照辨析"); expect(sceneIntentLabel("verify")).toBe("回看验证"); });
});
