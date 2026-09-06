import { describe, expect, it } from "vitest";
import { thinkingPresentation } from "@/lib/learning/thinking-presentation";

describe("等待提示依据真实阶段", () => {
  it("图片和文字读题使用统一的友好描述", () => {
    expect(thinkingPresentation("正在识别题干与你的作答").title).toBe("正在读懂这道题");
    expect(thinkingPresentation("正在读懂你发来的题目").title).toBe("正在读懂这道题");
  });
  it("只有收到分析阶段才显示整理思路", () => expect(thinkingPresentation("正在理解题目要解决什么").title).toBe("正在梳理解题思路"));
  it("后续学习任务保留原始阶段，未知状态不声称完成读题", () => {
    expect(thinkingPresentation("正在核对这一步").title).toBe("正在核对这一步");
    expect(thinkingPresentation("").title).toBe("正在整理你的问题");
  });
});
