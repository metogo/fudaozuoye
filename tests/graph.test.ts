import { describe, expect, it } from "vitest";
import { advanceAfterMastery } from "@/lib/learning/api";
import { assertGraphInvariants, isReadyForOriginal, mergeExpansion } from "@/lib/learning/graph";
import { analyzeMock, expandMock, recognizeMock } from "@/lib/learning/mock-engine";

describe("知识 DAG 约束", () => {
  it("接受课标内、逐层简化且无环的初始图", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    expect(() => assertGraphInvariants(session)).not.toThrow();
    expect(session.nodes.filter((node) => node.kind === "concept")).toHaveLength(2);
  });

  it("不会单位量时继续下钻到更简单的除法", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const target = session.nodes.find((node) => node.conceptId === "math.rate.unit-rate")!;
    const expansion = expandMock(session, target.id);
    const next = mergeExpansion(session, target.id, expansion.nodes, expansion.edges);
    const division = next.nodes.find((node) => node.conceptId === "math.arithmetic.division");
    expect(division?.difficulty).toBeLessThan(target.difficulty);
    expect(next.currentNodeId).toBe(division?.id);
    expect(() => assertGraphInvariants(next)).not.toThrow();
  });

  it("拒绝循环和没有严格简化的关系", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const [root, first] = session.nodes;
    const broken = { ...session, edges: [...session.edges, { from: root.id, to: first.id, reason: "错误反向关系" }] };
    expect(() => assertGraphInvariants(broken)).toThrow(/前置知识没有严格简化|循环/);
  });

  it("只有所有直接前置掌握后才回到原题", () => {
    let session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    expect(isReadyForOriginal(session)).toBe(false);
    session = { ...session, nodes: session.nodes.map((node) => node.kind === "concept" ? { ...node, state: "mastered" as const } : node) };
    expect(isReadyForOriginal(session)).toBe(true);
    expect(advanceAfterMastery(session).stage).toBe("original_check");
  });

  it("高学段允许回补已经学过的低学段原子知识", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const multiplication = session.nodes.find((node) => node.conceptId === "math.arithmetic.multiplication")!;
    const expansion = expandMock(session, multiplication.id);
    expect(() => mergeExpansion(session, multiplication.id, expansion.nodes, expansion.edges)).not.toThrow();
  });

  it("拆解深度不固定为两层，会沿真实前置关系持续到原子点", () => {
    let session = analyzeMock(recognizeMock("physics", "senior"), "doubao");
    const newton = session.nodes.find((node) => node.conceptId === "physics.newton.second-law")!;
    const first = expandMock(session, newton.id);
    session = mergeExpansion(session, newton.id, first.nodes, first.edges);

    const acceleration = session.nodes.find((node) => node.conceptId === "physics.motion.acceleration")!;
    const second = expandMock(session, acceleration.id);
    session = mergeExpansion(session, acceleration.id, second.nodes, second.edges);

    const speed = session.nodes.find((node) => node.conceptId === "physics.motion.speed")!;
    const third = expandMock(session, speed.id);
    session = mergeExpansion(session, speed.id, third.nodes, third.edges);

    expect(session.nodes.some((node) => node.conceptId === "physics.motion.distance-time")).toBe(true);
    expect(session.nodes.some((node) => node.atomic)).toBe(true);
    expect(() => assertGraphInvariants(session)).not.toThrow();
  });
});
