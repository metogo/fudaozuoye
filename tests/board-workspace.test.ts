import { describe, expect, it } from "vitest";
import { compileBoardDocument, createBoardWorkspaceState, isStoredBoardWorkspaceState, restoreBoardWorkspaceState } from "@/lib/learning/board-workspace";
import { compileBoardExperience, legacyBoardWorkspaceKey } from "@/lib/learning/board-experience";
import type { BoardLesson } from "@/lib/learning/types";

describe("板书工作台文档", () => {
  it("把板书场景编译为稳定节点和可追踪依赖", () => {
    const document = compileBoardDocument(compileBoardExperience(lesson()));
    expect(document.nodes.map((node) => node.id)).toEqual(["given", "relation", "derive", "check"]);
    expect(document.nodes[2].prerequisiteIds).toEqual(["relation", "given"]);
    expect(document.nodes[0].dependentIds).toContain("derive");
    expect(compileBoardDocument(compileBoardExperience(lesson())).key).toBe(document.key);
  });

  it("只为当次主动回忆保留最小临时状态", () => {
    const document = compileBoardDocument(compileBoardExperience(lesson()));
    const state = createBoardWorkspaceState(document);
    expect(state.mode).toBe("overview");
    expect(state.activeNodeId).toBe("given");
    expect(state.nodes).toHaveLength(4);
    expect(isStoredBoardWorkspaceState(state, document)).toBe(true);
  });

  it("恢复当前题目里的主动回忆位置", () => {
    const document = compileBoardDocument(compileBoardExperience(lesson()));
    const state = createBoardWorkspaceState(document);
    state.mode = "recall";
    state.activeNodeId = "derive";
    state.nodes[2] = { ...state.nodes[2], revealed: true };
    const storedValue = JSON.parse(JSON.stringify(state)) as unknown;
    expect(restoreBoardWorkspaceState(document, storedValue)).toEqual(state);
  });

  it("损坏或串题状态只重置当前回忆位置", () => {
    const document = compileBoardDocument(compileBoardExperience(lesson()));
    const invalid = { ...createBoardWorkspaceState(document), documentKey: "another-board" };
    const restored = restoreBoardWorkspaceState(document, invalid);
    expect(restored.documentKey).toBe(document.key);
    expect(restored.mode).toBe("overview");
    expect(restored.nodes.every((node) => !node.revealed)).toBe(true);
  });

  it("旧五段板书升级为动态场景时保留仍存在节点的回忆状态", () => {
    const document = compileBoardDocument(compileBoardExperience(lesson()));
    const legacy = { ...createBoardWorkspaceState(document), documentKey: document.legacyWorkspaceKey, nodes: [
      { nodeId: "given", revealed: true }, { nodeId: "relation", revealed: false },
      { nodeId: "derive", revealed: true }, { nodeId: "removed", revealed: true }, { nodeId: "check", revealed: false },
    ] };
    const restored = restoreBoardWorkspaceState(document, legacy);
    expect(restored.documentKey).toBe(document.key);
    expect(restored.nodes.map((node) => [node.nodeId, node.revealed])).toEqual([
      ["given", true], ["relation", false], ["derive", true], ["check", false],
    ]);
  });

  it("服务端重建过正文后仍按原缓存 key 迁移学习位置", () => {
    const original = lesson();
    const legacyKey = legacyBoardWorkspaceKey(original);
    const oldDocument = compileBoardDocument(compileBoardExperience(original));
    const oldState = createBoardWorkspaceState(oldDocument);
    oldState.documentKey = legacyKey;
    oldState.mode = "recall";
    oldState.activeNodeId = "derive";
    oldState.nodes[2].revealed = true;

    const rebuilt = structuredClone(original);
    rebuilt.blocks.forEach((block, index) => { block.content += ` 重建内容${index + 1}`; });
    rebuilt.plan!.scenes.forEach((scene, index) => { scene.content = rebuilt.blocks[index].content; });
    const rebuiltDocument = compileBoardDocument(compileBoardExperience(rebuilt, { legacyWorkspaceKey: legacyKey }));
    const restored = restoreBoardWorkspaceState(rebuiltDocument, oldState);
    expect(restored.mode).toBe("recall");
    expect(restored.activeNodeId).toBe("derive");
    expect(restored.nodes[2].revealed).toBe(true);
  });

  it("拒绝缺少回忆状态的损坏节点", () => {
    const document = compileBoardDocument(compileBoardExperience(lesson()));
    const invalid = createBoardWorkspaceState(document) as unknown as { nodes: Array<{ nodeId: string }> };
    invalid.nodes[0] = { nodeId: invalid.nodes[0].nodeId };
    expect(isStoredBoardWorkspaceState(invalid, document)).toBe(false);
  });

  it("拒绝会让依赖和学生记录串位的重复节点", () => {
    const duplicated = lesson();
    duplicated.plan!.scenes[1].id = duplicated.plan!.scenes[0].id;
    expect(() => compileBoardDocument(compileBoardExperience(duplicated))).toThrow("板书学习节点不能重复");
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
