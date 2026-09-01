import { describe, expect, it } from "vitest";
import { compileBoardDocument, createBoardWorkspaceState, isStoredBoardWorkspaceState, restoreBoardWorkspaceState } from "@/lib/learning/board-workspace";
import type { BoardLesson } from "@/lib/learning/types";

describe("板书工作台文档", () => {
  it("把板书场景编译为稳定节点和可追踪依赖", () => {
    const document = compileBoardDocument(lesson());
    expect(document.nodes.map((node) => node.id)).toEqual(["given", "relation", "derive", "check"]);
    expect(document.nodes[2].prerequisiteIds).toEqual(["relation", "given"]);
    expect(document.nodes[0].dependentIds).toContain("derive");
    expect(compileBoardDocument(lesson()).key).toBe(document.key);
  });

  it("只为当次主动回忆保留最小临时状态", () => {
    const document = compileBoardDocument(lesson());
    const state = createBoardWorkspaceState(document);
    expect(state.mode).toBe("overview");
    expect(state.activeNodeId).toBe("given");
    expect(state.nodes).toHaveLength(4);
    expect(isStoredBoardWorkspaceState(state, document)).toBe(true);
  });

  it("恢复当前题目里的主动回忆位置", () => {
    const document = compileBoardDocument(lesson());
    const state = createBoardWorkspaceState(document);
    state.mode = "recall";
    state.activeNodeId = "derive";
    state.nodes[2] = { ...state.nodes[2], revealed: true };
    const storedValue = JSON.parse(JSON.stringify(state)) as unknown;
    expect(restoreBoardWorkspaceState(document, storedValue)).toEqual(state);
  });

  it("损坏或串题状态只重置当前回忆位置", () => {
    const document = compileBoardDocument(lesson());
    const invalid = { ...createBoardWorkspaceState(document), documentKey: "another-board" };
    const restored = restoreBoardWorkspaceState(document, invalid);
    expect(restored.documentKey).toBe(document.key);
    expect(restored.mode).toBe("overview");
    expect(restored.nodes.every((node) => !node.revealed)).toBe(true);
  });

  it("拒绝缺少回忆状态的损坏节点", () => {
    const document = compileBoardDocument(lesson());
    const invalid = createBoardWorkspaceState(document) as unknown as { nodes: Array<{ nodeId: string }> };
    invalid.nodes[0] = { nodeId: invalid.nodes[0].nodeId };
    expect(isStoredBoardWorkspaceState(invalid, document)).toBe(false);
  });

  it("拒绝会让依赖和学生记录串位的重复节点", () => {
    const duplicated = lesson();
    duplicated.plan!.scenes[1].id = duplicated.plan!.scenes[0].id;
    expect(() => compileBoardDocument(duplicated)).toThrow("板书学习节点不能重复");
  });
});

function lesson(): BoardLesson {
  const blocks = [
    { id: "given", label: "整理条件", content: "已知 $a=b$。", tone: "plain" as const },
    { id: "relation", label: "建立关系", content: "把相等关系代入。", tone: "key" as const },
    { id: "derive", label: "展开推导", content: "得到下一步等式。", tone: "plain" as const },
    { id: "check", label: "回看验证", content: "检查条件是否全部使用。", tone: "example" as const },
  ];
  return {
    title: "测试板书", subtitle: "看清条件如何进入推导", layout: "steps", blocks, annotations: [], returnLabel: "回到原题",
    plan: {
      learningGoal: "看清条件如何进入推导", sourceMessageIds: ["m1"],
      scenes: blocks.map((block, index) => ({ id: block.id, title: block.label, content: block.content, tone: block.tone, intent: (["extract", "connect", "derive", "verify"] as const)[index], sourceMessageIds: ["m1"], visual: null })),
    },
  };
}
