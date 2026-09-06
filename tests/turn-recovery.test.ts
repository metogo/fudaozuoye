import { describe, expect, it } from "vitest";
import { isOptionalPracticeTurn, turnIdleTimeout } from "@/lib/learning/turn-recovery";

describe("可选练习失败不锁住主流程", () => {
  it("两个同类练习入口都可以回到原任务", () => {
    for (const input of [
      { type: "request_transfer" } as const,
      { type: "choose", gateId: "review", choice: "practice_similar" } as const,
    ]) {
      expect(isOptionalPracticeTurn(input)).toBe(true);
      expect(turnIdleTimeout(input)).toBeGreaterThan(60_000);
    }
  });
  it("必须完成的操作仍保留重试保护", () => {
    for (const input of [
      { type: "choose", gateId: "step", choice: "continue" } as const,
      { type: "choose", gateId: "step", choice: "try" } as const,
      { type: "answer", gateId: "answer", answer: "22" } as const,
    ]) {
      expect(isOptionalPracticeTurn(input)).toBe(false);
      expect(turnIdleTimeout(input)).toBe(45_000);
    }
  });
});
