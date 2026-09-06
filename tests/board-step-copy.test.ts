import { describe, expect, it } from "vitest";
import { boardStepDisplayCopy } from "@/lib/learning/board-step-copy";
import type { BoardTeachingRole } from "@/lib/learning/types";

const canonicalRoles: BoardTeachingRole[] = ["orient", "model", "reason", "misconception", "recap"];

describe("板书步骤展示文案", () => {
  it("标准数学五步使用学生能直接理解的动作和结果", () => {
    const copy = canonicalRoles.map((role, index) => boardStepDisplayCopy({
      subject: "math", role, roles: canonicalRoles, title: `原始标题${index + 1}`, index,
    }));

    expect(copy).toEqual([
      { eyebrow: "看懂题目", title: "已知什么，要解决什么" },
      { eyebrow: "找出联系", title: "条件之间怎么连起来" },
      { eyebrow: "关键推导", title: "从哪里开始，为什么这样做" },
      { eyebrow: "易错检查", title: "哪些地方最容易出错" },
      { eyebrow: "举一反三", title: "同类题怎么解决" },
    ]);
  });

  it("标准五步判定只依赖学科和角色，不依赖 AI 生成标题", () => {
    expect(boardStepDisplayCopy({
      subject: "math", role: "orient", roles: canonicalRoles, title: "已知什么，要解决什么", index: 0,
    })).toEqual({ eyebrow: "看懂题目", title: "已知什么，要解决什么" });
  });

  it("非数学板书保留学科原生标题", () => {
    expect(boardStepDisplayCopy({
      subject: "science", role: "model", roles: canonicalRoles, title: "量与方向", index: 1,
    })).toEqual({ eyebrow: "找出联系", title: "量与方向" });
  });

  it("数学场景角色顺序异常时不按索引误配标题", () => {
    const roles: BoardTeachingRole[] = ["orient", "reason", "model", "misconception", "recap"];
    expect(boardStepDisplayCopy({
      subject: "math", role: "reason", roles, title: "真实推导步骤", index: 1,
    })).toEqual({ eyebrow: "关键推导", title: "真实推导步骤" });
  });

  it.each([
    { roles: [] as BoardTeachingRole[] },
    { roles: ["orient", "model", "reason", "recap"] as BoardTeachingRole[] },
    { roles: ["orient", "model", "reason", "misconception", "transfer", "recap"] as BoardTeachingRole[] },
  ])("数学场景不是标准五步时保留原生标题", ({ roles }) => {
    expect(boardStepDisplayCopy({
      subject: "math", role: "model", roles, title: "本题的关系结构", index: 1,
    })).toEqual({ eyebrow: "找出联系", title: "本题的关系结构" });
  });

  it("步骤短标题始终保持三到四个字，且旧板书也能区分各步", () => {
    const copies = Array.from({ length: 5 }, (_, index) => boardStepDisplayCopy({
      roles: [], title: `旧板书步骤${index + 1}`, index,
    }));

    expect(copies.map((copy) => copy.eyebrow)).toEqual(["理解题意", "整理关系", "开始推导", "核对结果", "归纳方法"]);
    for (const copy of copies) expect(Array.from(copy.eyebrow).length).toBeGreaterThanOrEqual(3);
    for (const copy of copies) expect(Array.from(copy.eyebrow).length).toBeLessThanOrEqual(4);
  });

  it("不完整旧板书也为迁移、回顾与未知步骤提供可读动作", () => {
    const copy = (role: BoardTeachingRole | undefined, index: number) => boardStepDisplayCopy({ roles: [], role, title: "原生标题", index });
    expect(copy("transfer", 4).eyebrow).toBe("举一反三");
    expect(copy("recap", 4).eyebrow).toBe("回顾方法");
    expect(copy(undefined, 0).eyebrow).toBe("理解题意");
    expect(copy(undefined, 8).eyebrow).toBe("第9步");
    expect(boardStepDisplayCopy({ subject: "math", roles: canonicalRoles, role: undefined, title: "额外步骤", index: 8 })).toEqual({ eyebrow: "第9步", title: "额外步骤" });
  });
});
