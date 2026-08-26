import { describe, expect, it } from "vitest";
import { getConcept } from "@/lib/learning/curriculum";
import { analyzeMock, expandMock, nodeFromConcept, recognizeMock, transferCheckMock, verifyMock } from "@/lib/learning/mock-engine";

describe("Mock 学习引擎", () => {
  it.each([
    ["math", "primary"], ["math", "junior"], ["math", "senior"],
    ["physics", "junior"], ["physics", "senior"],
    ["chemistry", "junior"], ["chemistry", "senior"],
  ] as const)("覆盖 %s / %s 的完整初始分析", (subject, band) => {
    const problem = recognizeMock(subject, band);
    const session = analyzeMock(problem, "doubao");
    expect(session.problem.subject).toBe(subject);
    expect(session.nodes.length).toBeGreaterThanOrEqual(2);
    expect(session.edges.length).toBe(session.nodes.length - 1);
  });

  it("原子点不会被继续拆解", () => {
    const session = analyzeMock(recognizeMock("chemistry", "junior"), "doubao");
    const atomic = session.nodes.find((node) => node.conceptId === "chemistry.equation.conservation")!;
    expect(atomic.atomic).toBe(true);
    expect(() => expandMock(session, atomic.id)).toThrow(/最小概念/);
  });

  it("微型题使用标准答案进行明确验收", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const multiplication = session.nodes.find((node) => node.conceptId === "math.arithmetic.multiplication")!;
    expect(verifyMock(multiplication.check, "48").passed).toBe(true);
    expect(verifyMock(multiplication.check, "16").passed).toBe(false);
    expect(verifyMock(multiplication.check, "4").passed).toBe(false);
    expect(verifyMock(multiplication.check, "").passed).toBe(false);
  });

  it("高中数学迁移题仍检验二次函数", () => {
    const check = transferCheckMock("math", "senior");
    expect(check.conceptId).toBe("math.function.quadratic");
    expect(check.prompt).toContain("二次函数");
  });

  it("迁移题改变情境但保留同一验收机制", () => {
    const check = transferCheckMock("physics", "junior");
    expect(check.prompt).toContain("72");
    expect(verifyMock(check, "12 m/s").passed).toBe(true);
  });

  it("目录中的非原子点都声明直接前置", () => {
    const ids = ["math.rate.unit-rate", "math.ratio.proportional", "physics.motion.speed", "chemistry.equation.balance"];
    ids.forEach((id) => expect(getConcept(id)?.prerequisites.length).toBeGreaterThan(0));
  });

  it("演示入口可到达的每个概念都有应用型检查题", () => {
    const reachable = new Set<string>();
    const visit = (conceptId: string) => {
      if (reachable.has(conceptId)) return;
      reachable.add(conceptId);
      getConcept(conceptId)?.prerequisites.forEach(visit);
    };
    (["math", "physics", "chemistry"] as const).forEach((subject) => {
      (["primary", "junior", "senior"] as const).forEach((band) => {
        if (subject !== "math" && band === "primary") return;
        analyzeMock(recognizeMock(subject, band), "doubao").nodes.filter((node) => node.kind === "concept").forEach((node) => visit(node.conceptId));
      });
    });
    expect(reachable.size).toBeGreaterThanOrEqual(30);
    reachable.forEach((conceptId) => {
      const node = nodeFromConcept(conceptId);
      expect(node.check.prompt).not.toBe("");
      expect(node.check.answer).not.toBe("");
      expect(node.check.prompt).not.toContain("对应下面哪个知识点");
    });
  });
});
