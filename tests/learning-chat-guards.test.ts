import { describe, expect, it } from "vitest";
import { choiceDisplayText, choicesFromSession, composerPlaceholder, currentTaskCopy } from "@/components/learning-chat";

import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import type { LearningSession } from "@/lib/learning/types";
const initialSession = analyzeMock(recognizeMock("math", "primary"), "doubao");
const check = initialSession.nodes.find(node => node.check)!.check!;
const session: LearningSession = {
  ...initialSession,
  flow: { ...initialSession.flow, stage: "core_explanation" },
  transferCheck: { ...check, choices: ["A. 迁移答案", "B. 另一个答案"] },
  nodes: [{ ...initialSession.nodes[0], id: "n", check: { ...check, choices: ["A. 节点答案", "B. 另一个节点答案"] } }],
};

describe("对话任务文案与答案来源", () => {
  it("根据会话状态给出准确的输入提示", () => {
    expect(composerPlaceholder(null, false)).toBe("AI 服务正在准备");
    expect(composerPlaceholder(null, true)).toBe("输入一道题目…");
    expect(composerPlaceholder(session, true)).toBe("继续问这道题…");
    expect(currentTaskCopy(session, { id: "gate", title: "任务", kind: "understanding" }, false).intent).toContain("核心思路");
    expect(currentTaskCopy({ ...session, flow: { ...session.flow, stage: "remediation" } }, { id: "gate", title: "任务", kind: "understanding" }, false).intent).toContain("新的讲法");
    expect(currentTaskCopy(session, { id: "gate", title: "任务", kind: "step_answer" }, false).intent).toContain("显示答案");
    expect(currentTaskCopy(session, { id: "gate", title: "任务", kind: "node_answer" }, false).intent).toContain("小题");
    expect(currentTaskCopy(session, { id: "gate", title: "任务", kind: "solution_review" }, false).intent).toContain("完整阅读");
    expect(currentTaskCopy(session, { id: "gate", title: "任务", kind: "solution_recall_answer" }, false).intent).toContain("自己的话");
    expect(currentTaskCopy(session, { id: "gate", title: "任务", kind: "post_solution" }, false).intent).toContain("验证");
    expect(currentTaskCopy(session, { id: "gate", title: "任务", kind: "original_answer" }, false).intent).toContain("原题");
    expect(currentTaskCopy(session, { id: "gate", title: "任务", kind: "transfer_answer" }, false).intent).toContain("同类题");
    expect(currentTaskCopy(session, { id: "gate", title: "任务", kind: "needs_help" }, false).intent).toContain("卡点");
    expect(currentTaskCopy(session, { id: "gate", title: "任务", kind: "node_answer" }, true)).toEqual({ intent: "解决你对当前步骤的疑问", placeholder: "具体说说你卡在哪一步…" });
  });

  it("优先从正确的任务节点读取选择项，并清理常见选项标签", () => {
    expect(choicesFromSession(null, { id: "gate", title: "任务", kind: "node_answer", nodeId: "n" })).toBeUndefined();
    expect(choicesFromSession(session, { id: "gate", title: "任务", kind: "solution_recall_answer", nodeId: "n" })).toBeUndefined();
    expect(choicesFromSession(session, { id: "gate", title: "任务", kind: "transfer_answer" })).toEqual(session.transferCheck!.choices);
    expect(choicesFromSession(session, { id: "gate", title: "任务", kind: "node_answer", nodeId: "n" })).toEqual(session.nodes[0].check!.choices);
    expect(choicesFromSession(session, { id: "gate", title: "任务", kind: "node_answer", nodeId: "missing" })).toBeUndefined();
    expect(choiceDisplayText("A. 判别式大于等于零", 0)).toBe("判别式大于等于零");
    expect(choiceDisplayText("（2）第二项", 1)).toBe("（2）第二项");
  });
});
