import { describe, expect, it } from "vitest";
import { enrichBoardLessonWithSafeAids } from "@/lib/learning/board-aids";
import { assertBoardExperience, compileBoardExperience, legacyBoardWorkspaceKey } from "@/lib/learning/board-experience";
import { assertDirectedBoardMoves, directBoardBlueprint, directBoardScenes } from "@/lib/learning/board-director";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { subjects, type BoardFormulaVisual, type BoardLesson, type BoardScene } from "@/lib/learning/types";

describe("可执行教学板书协议", () => {
  it("把固定五段迁移成按内容价值选择的动态场景", () => {
    const experience = compileBoardExperience(lesson(scenes()));
    expect(experience.version).toBe(1);
    expect(experience.scenes.map((scene) => scene.id)).toEqual(["s1", "s3", "s5"]);
    expect(experience.scenes.every((scene) => scene.actions[0]?.targetId === scene.elements[0]?.id)).toBe(true);
  });

  it("同题不同卡点会保留不同的关键场景", () => {
    const first = scenes();
    first[1].sourceMessageIds = ["blocker-a"];
    const second = scenes();
    second[3].sourceMessageIds = ["blocker-b"];
    expect(compileBoardExperience(lesson(first)).scenes.map((scene) => scene.id)).toEqual(["s1", "s2", "s3", "s5"]);
    expect(compileBoardExperience(lesson(second)).scenes.map((scene) => scene.id)).toEqual(["s1", "s3", "s4", "s5"]);
  });

  it("公式推导作为主介质，不再把长正文作为第一内容", () => {
    const input = scenes().slice(0, 4);
    input[2].visual = formulaVisual();
    const scene = compileBoardExperience(lesson(input)).scenes[2];
    expect(scene.medium).toBe("derivation");
    expect(scene.elements).toEqual([
      { id: "s3-visual", type: "visual", visual: input[2].visual, fallbackText: input[2].content },
    ]);
  });

  it("介质内容改变时生成新的体验 key，避免恢复旧题的学习位置", () => {
    const first = scenes().slice(0, 4);
    first[2].visual = formulaVisual();
    const second = structuredClone(first);
    if (second[2].visual?.kind === "formula_chain") second[2].visual.steps[1].explanation = "改用另一条已验证的等价依据";
    expect(compileBoardExperience(lesson(first)).key).not.toBe(compileBoardExperience(lesson(second)).key);
  });

  it("单个专用介质损坏时只把当前场景降级为文字", () => {
    const input = scenes().slice(0, 4);
    input[1].visual = { ...formulaVisual(), steps: [{ id: "only", expression: "$a=b$", explanation: "只有一步" }] };
    input[2].visual = formulaVisual();
    const experience = compileBoardExperience(lesson(input));
    expect(experience.scenes[1].medium).toBe("text");
    expect(experience.scenes[2].medium).toBe("derivation");
  });

  it("嵌套数组损坏的配图不会拖垮整页板书", () => {
    const input = scenes().slice(0, 4);
    input[1].visual = { kind: "concept_graph", title: "坏图", evidence: "题内证据", caption: "应当降级" } as unknown as BoardScene["visual"];
    expect(() => compileBoardExperience(lesson(input))).not.toThrow();
    expect(compileBoardExperience(lesson(input)).scenes[1].medium).toBe("text");
  });

  it("不会因为先截前六段而丢掉后面的高价值场景", () => {
    const input = [...scenes(), ...scenes().slice(0, 2).map((scene, index) => ({ ...scene, id: `late-${index}`, title: `后置${index}`, content: `后置内容${index}` }))];
    input[6].sourceMessageIds = ["student-blocker"];
    expect(directBoardScenes(input).map((scene) => scene.id)).toContain("late-1");
  });

  it("正文相同但职责不同的场景不会被错误合并", () => {
    const input = scenes().slice(0, 4);
    input[1].content = input[0].content;
    expect(directBoardScenes(input)).toHaveLength(4);
  });

  it("同一道题会根据卡在题意还是卡在推导选择不同动作", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const scope = { kind: "problem" as const };
    const reading = directBoardBlueprint(session, scope, [{ id: "q1", role: "user", text: "我卡在题意，不知道已知是什么" }]);
    const deriving = directBoardBlueprint(session, scope, [{ id: "q2", role: "user", text: "我卡在推导，不知道为什么这样变形" }]);
    expect(reading.map((move) => move.id)).not.toEqual(deriving.map((move) => move.id));
    expect(reading.length).toBeGreaterThanOrEqual(2);
    expect(deriving.some((move) => move.role === "misconception")).toBe(true);
  });

  it("不论模型协议都不能改写 Director 预先选定的动作", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const scope = { kind: "problem" as const };
    const dialogue = [{ id: "q1", role: "user" as const, text: "第二步是从哪儿来的？" }];
    const directed = directBoardBlueprint(session, scope, dialogue).map((move) => move.id);
    expect(() => assertDirectedBoardMoves(session, scope, dialogue, directed.slice(0, -1))).toThrow("Director 选定的教学动作");
    expect(() => assertDirectedBoardMoves(session, scope, dialogue, directed)).not.toThrow();
  });

  it("没有明确课内关系时不会用通用节点伪造数学关系图", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    session.problem.text = "已知三角形ABC中，AB=AC，点D是BC中点。请证明AD垂直BC。";
    const enriched = enrichBoardLessonWithSafeAids(session, lesson(scenes()));
    const fakeRelation = compileBoardExperience(enriched).scenes.find((scene) => scene.visual?.kind === "concept_graph" && scene.visual.nodes.some((node) => node.label === "核心关系"));
    expect(fakeRelation).toBeUndefined();
  });

  it("旧区块协议也能单向迁移并稳定重开", () => {
    const old: BoardLesson = { ...lesson(scenes().slice(0, 3)), plan: undefined };
    const first = compileBoardExperience(old);
    const reopened = compileBoardExperience(JSON.parse(JSON.stringify(old)) as BoardLesson);
    expect(reopened.key).toBe(first.key);
    expect(reopened.scenes).toHaveLength(3);
  });

  it("体验协议会拒绝空场景、重复节点和损坏的动作引用", () => {
    expect(() => compileBoardExperience(lesson(scenes().slice(0, 1)))).toThrow("至少需要两个");
    const duplicated = scenes().slice(0, 2);
    duplicated[1].id = duplicated[0].id;
    expect(() => compileBoardExperience(lesson(duplicated))).toThrow("不能重复");

    const valid = compileBoardExperience(lesson(scenes()));
    expect(legacyBoardWorkspaceKey(lesson(scenes()))).toContain("board-");
    expect(() => assertBoardExperience({ ...valid, layout: "unknown" })).toThrow("协议不合法");
    expect(() => assertBoardExperience({ ...valid, scenes: [{ ...valid.scenes[0], actions: [{ ...valid.scenes[0].actions[0], targetId: "missing" }] }, valid.scenes[1]] })).toThrow("动作指向");
    expect(() => assertBoardExperience({ ...valid, scenes: [{ ...valid.scenes[0], elements: [] }, valid.scenes[1]] })).toThrow("元素必须");
  });

  it("证据链主介质会以来源场景呈现，并拒绝无效视觉元素", () => {
    const input = scenes().slice(0, 3);
    input[1].visual = { kind: "evidence_chain", title: "证据", evidence: "题目条件", caption: "由条件得到结论", links: [{ id: "e1", quote: "有两个实数根", meaning: "判别式非负" }, { id: "e2", quote: "二次项系数非零", meaning: "可以用判别式" }] } as BoardScene["visual"];
    const experience = compileBoardExperience(lesson(input));
    expect(experience.scenes[1].medium).toBe("source");
    const invalid = structuredClone(experience);
    invalid.scenes[1].elements[0] = { id: "broken", type: "visual", visual: null as never, fallbackText: "" };
    expect(() => assertBoardExperience(invalid)).toThrow("元素内容不合法");
  });

  it.each(subjects)("%s 代表板书都能迁移为可读的动态体验", (subject) => {
    const input = scenes();
    const current = lesson(input);
    current.plan = { ...current.plan!, discipline: subject };
    const experience = compileBoardExperience(current);
    expect(experience.subject).toBe(subject);
    expect(experience.scenes.length).toBeGreaterThanOrEqual(2);
    expect(experience.scenes.length).toBeLessThanOrEqual(6);
    expect(experience.scenes.every((scene) => scene.elements.length > 0)).toBe(true);
  });
});

function scenes(): BoardScene[] {
  const roles = ["orient", "model", "reason", "misconception", "recap"] as const;
  const intents = ["extract", "connect", "derive", "compare", "verify"] as const;
  return roles.map((role, index) => ({
    id: `s${index + 1}`,
    title: `场景${index + 1}`,
    content: `这是第${index + 1}个互不重复的教学内容。`,
    tone: index === 2 ? "key" : "plain",
    intent: intents[index],
    role,
    sourceMessageIds: [],
    visual: null,
  }));
}

function lesson(input: BoardScene[]): BoardLesson {
  return {
    title: "测试板书",
    subtitle: "看清当前关系",
    layout: "steps",
    blocks: input.map((scene) => ({ id: scene.id, label: scene.title, content: scene.content, tone: scene.tone })),
    annotations: [],
    plan: { learningGoal: "看清当前关系", sourceMessageIds: [], scenes: input },
    returnLabel: "回到原题",
  };
}

function formulaVisual(): BoardFormulaVisual {
  return {
    kind: "formula_chain",
    title: "推导主线",
    evidence: "题目给出 $a=b$",
    caption: "每一步只做一次等价变形。",
    steps: [
      { id: "f1", expression: "$a=b$", explanation: "写出已知关系" },
      { id: "f2", expression: "$a+c=b+c$", explanation: "两边同时加上同一个量" },
    ],
  };
}
