import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WhiteboardInput } from "@/components/whiteboard-input";

describe("白板作答入口", () => {
  it("提供画笔、橡皮、撤销、重做、清空和提交动作", () => {
    const html = renderToStaticMarkup(createElement(WhiteboardInput, {
      taskLabel: "独立完成原题",
      submitLabel: "提交作答",
      onConfirm: () => {},
      onCancel: () => {},
    }));
    for (const label of ["画笔", "橡皮", "撤销", "重做", "清空", "提交作答", "取消"]) expect(html).toContain(label);
    expect(html).toContain("白板作答");
  });
});
