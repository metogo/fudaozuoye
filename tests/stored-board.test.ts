import { describe, expect, it } from "vitest";
import { isStoredBoardCache, isStoredBoardLesson, restoreBoardLesson } from "@/lib/learning/board-cache";
import { enrichBoardLessonWithSafeAids, isBoardLessonSafeForRestore } from "@/lib/learning/board-aids";
import { createNativeBoardBlocks, createNativeBoardFallbackPlan } from "@/lib/learning/board-native-fallback";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { createInstantBoardLesson, createSafeBoardLesson } from "@/lib/learning/providers/board";
import type { BoardLesson } from "@/lib/learning/types";

const contents = ["先看清题目给出的条件。", "再连接条件之间的关系。", "最后核对每一步的依据。"];
const lesson = {
  title: "板书",
  subtitle: "梳理关系",
  returnLabel: "回到主线",
  layout: "steps",
  blocks: contents.map((content, index) => ({ id: `board-${index + 1}`, label: `步骤${index + 1}`, content, tone: "plain" })),
  annotations: [],
  plan: {
    learningGoal: "看清条件关系",
    sourceMessageIds: [],
    scenes: ["extract", "connect", "verify"].map((intent, index) => ({ id: `board-${index + 1}`, title: `步骤${index + 1}`, content: contents[index], intent, tone: "plain", sourceMessageIds: [], visual: null })),
  },
};

describe("板书缓存恢复", () => {
  it("没有外部材料的合法概念板书也能恢复，不强造证据", () => {
    const session = analyzeMock(recognizeMock("biology", "junior"), "doubao");
    session.problem.text = "说明光合作用的意义。";
    session.problemGuide.goal = "解释光合作用的意义。";
    const current = createInstantBoardLesson(session, { kind: "problem" }, { recommended: true, reason: "解释生命过程。", layout: "steps" });
    expect(current.plan?.scenes.every((scene) => scene.evidence === undefined)).toBe(true);
    expect(restoreBoardLesson(session, current)?.plan?.discipline).toBe("biology");
  });
  it("不会恢复旧版本留下的降级板书", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const fallback = createSafeBoardLesson(session, session.flow.focus, {
      recommended: true,
      reason: "当前关系适合用板书展开",
      layout: "relation",
    });

    expect(fallback.quality?.status).toBe("safe_fallback");
    expect(isStoredBoardLesson(fallback)).toBe(false);
    expect(restoreBoardLesson(session, fallback)).toBeNull();
  });

  it("接受完整计划并拒绝会让渲染崩溃的残缺语义图", () => {
    expect(isStoredBoardLesson(lesson)).toBe(true);
    const broken = structuredClone(lesson) as unknown as { plan: { scenes: Array<Record<string, unknown>> } };
    broken.plan.scenes[0].visual = { kind: "formula_chain", title: "公式", evidence: "原题", caption: "说明" };
    expect(isStoredBoardLesson(broken)).toBe(false);

    const duplicate = structuredClone(lesson) as unknown as { plan: { scenes: Array<Record<string, unknown>> } };
    duplicate.plan.scenes[0].visual = {
      kind: "evidence_chain", title: "证据", evidence: "先看清题目给出的条件。", caption: "只使用当前板书原文。",
      links: [
        { id: "same", quote: "先看清题目给出的条件。", meaning: "确定题目条件" },
        { id: "same", quote: "再连接条件之间的关系。", meaning: "建立条件关系" },
      ],
    };
    expect(isStoredBoardLesson(duplicate)).toBe(false);
  });

  it("拒绝场景与正文错位的陈旧缓存", () => {
    const wrongId = structuredClone(lesson) as unknown as { plan: { scenes: Array<Record<string, unknown>> } };
    wrongId.plan.scenes[1].id = "another-block";
    expect(isStoredBoardLesson(wrongId)).toBe(false);

    const wrongContent = structuredClone(lesson) as unknown as { plan: { scenes: Array<Record<string, unknown>> } };
    wrongContent.plan.scenes[1].content = "已经不是正文里的内容";
    expect(isStoredBoardLesson(wrongContent)).toBe(false);

    const unrelatedSource = structuredClone(lesson) as unknown as { plan: { sourceMessageIds: string[] } };
    unrelatedSource.plan.sourceMessageIds = ["unreferenced-chat"];
    expect(isStoredBoardLesson(unrelatedSource)).toBe(false);
  });

  it("没有语义计划的旧缓存不会被强塞自引用学习脉络图", () => {
    const legacy = { ...lesson, plan: undefined } as BoardLesson;
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const upgraded = enrichBoardLessonWithSafeAids(session, legacy);

    expect(upgraded.plan?.scenes).toHaveLength(legacy.blocks.length);
    expect(upgraded.plan?.scenes.some((scene) => scene.visual?.kind === "concept_graph")).toBe(false);
  });

  it("服务端恢复旧缓存时重建为新版教学内容，不再复用 Chat 式长段落", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    session.problemGuide.approach = "### 这是 Chat 讲解\n\n第一大段解释。第二大段解释。第三大段解释，不应进入板书正文。";
    const legacy = structuredClone(lesson) as BoardLesson;
    legacy.blocks[1].content = "这是旧会话里直接复制的一整段聊天解释，不应该继续作为新版板书正文展示。";
    legacy.plan!.scenes[1].content = legacy.blocks[1].content;

    const restored = restoreBoardLesson(session, legacy);

    expect(restored?.plan?.version).toBe(2);
    expect(restored?.blocks).toHaveLength(5);
    expect(restored?.plan?.contentRevision).toBe(2);
    expect(restored?.plan?.scenes.map((scene) => scene.role)).toEqual(["orient", "model", "reason", "misconception", "recap"]);
    expect(restored?.blocks.some((block) => block.content.includes("直接复制的一整段聊天解释"))).toBe(false);
    expect(restored?.blocks.some((block) => block.content.includes("这是 Chat 讲解"))).toBe(false);
    expect(restored?.blocks.every((block) => block.content.length < 260)).toBe(true);
  });

  it("拒绝缺少教学职责字段的伪新版缓存", () => {
    const fakeNative = structuredClone(lesson) as BoardLesson;
    fakeNative.plan = { ...fakeNative.plan!, version: 2, contentRevision: 1, subject: "math", thesis: "先建立关系，再检查每一步依据。" };

    expect(isStoredBoardLesson(fakeNative)).toBe(false);
  });

  it("拒绝职责重复或缺少收束环节的伪新版缓存", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const blocks = createNativeBoardBlocks(session, session.flow.focus);
    const native = {
      ...structuredClone(lesson),
      blocks,
      plan: createNativeBoardFallbackPlan(session, blocks),
    } as BoardLesson;
    native.plan!.scenes[4].role = "model";

    expect(isStoredBoardLesson(native)).toBe(false);
  });

  it("结构合法但泄露答案的旧缓存不会重新展示", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    root.check.answer = "8";
    const leaked = structuredClone(lesson) as BoardLesson;
    leaked.plan!.learningGoal = "最终答案是8";

    expect(isStoredBoardLesson(leaked)).toBe(true);
    expect(isBoardLessonSafeForRestore(session, leaked)).toBe(false);
  });

  it("客户端已抹掉标准答案时不冒充已通过旧缓存安全校验", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    root.check.answer = "";

    expect(isBoardLessonSafeForRestore(session, lesson as BoardLesson)).toBe(false);
  });

  it("只恢复与当前题目匹配的新版本板书缓存", () => {
    expect(isStoredBoardCache({ version: 2, requestId: "problem-1", lesson }, "problem-1")).toBe(true);
    expect(isStoredBoardCache({ version: 1, requestId: "problem-1", lesson }, "problem-1")).toBe(false);
    expect(isStoredBoardCache({ version: 2, requestId: "another-problem", lesson }, "problem-1")).toBe(false);
    expect(isStoredBoardCache({ version: 2, requestId: "problem-1", lesson: { ...lesson, blocks: [] } }, "problem-1")).toBe(false);
  });

  it("新版缓存正文即使被改写，恢复时也只重建当前学科可信内容", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    root.check.answer = "8";
    const blocks = createNativeBoardBlocks(session, session.flow.focus);
    const leaked = {
      ...structuredClone(lesson),
      blocks,
      annotations: [],
      plan: createNativeBoardFallbackPlan(session, blocks),
    } as BoardLesson;
    leaked.plan!.learningGoal = "最终答案是8";

    expect(isStoredBoardCache({ version: 2, requestId: session.requestId, lesson: leaked }, session.requestId)).toBe(true);
    const restored = restoreBoardLesson(session, leaked);
    expect(restored).not.toBeNull();
    expect(restored?.plan?.learningGoal).not.toContain("最终答案是8");
    expect(restored?.blocks.map((block) => block.label)).toEqual(["题意成模", "关系结构", "依据变换", "反查边界", "迁移骨架"]);
  });

  it("新版缓存中的虚构配图不会重新展示", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const blocks = createNativeBoardBlocks(session, session.flow.focus);
    const tampered = {
      ...structuredClone(lesson),
      blocks,
      annotations: [],
      plan: createNativeBoardFallbackPlan(session, blocks),
    } as BoardLesson;
    tampered.plan!.scenes[1].visual = {
      kind: "concept_graph",
      title: "虚构关系",
      evidence: "题目从未给出的条件",
      caption: "这张图的字段完整，但事实依据并不存在。",
      direction: "left-right",
      nodes: [{ id: "a", label: "条件", role: "given" }, { id: "b", label: "结论", role: "step" }],
      edges: [{ from: "a", to: "b", label: "导致" }],
    };

    expect(isStoredBoardLesson(tampered)).toBe(true);
    const restored = restoreBoardLesson(session, tampered);
    expect(restored).not.toBeNull();
    expect(restored?.plan?.scenes.some((scene) => scene.visual?.title === "虚构关系")).toBe(false);
  });

  it("缓存恢复不复用可能被污染的旧副标题", () => {
    const session = analyzeMock(recognizeMock("chemistry", "junior"), "doubao");
    session.problem.text = "下列物质中属于化合物的是：A. 氧气 B. 二氧化碳 C. 空气 D. 铁。";
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    root.check.answer = "二氧化碳";
    const current = createInstantBoardLesson(session, { kind: "problem" }, { recommended: true, reason: "核对分类依据。", layout: "comparison" });
    const polluted = { ...current, subtitle: "由此锁定二氧化碳" };

    const restored = restoreBoardLesson(session, polluted);

    expect(restored).not.toBeNull();
    expect(restored?.subtitle).not.toContain("二氧化碳");
  });

  it("识别 KaTeX 包装中的单字符答案泄露", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    root.check.answer = "8";
    const deeplyWrapped = `$x=${"\\pmb{".repeat(12)}8${"}".repeat(12)}$`;
    for (const content of ["$x=\\boxed{8}$", "$x=\\color{red}{8}$", "$x=\\underline{8}$", "最终答案为 $\\overline{8}$", "$x=\\underline{\\color{red}{8}}$", "$x=\\boxed{\\textcolor{red}{8}}$", "$x=\\overline{\\colorbox{red}{8}}$", "$x=\\cancel{8}$", "$x=\\fbox{8}$", "$x=\\mathsf{8}$", "$x=\\widehat{8}$", "$x=\\displaystyle \\boxed{8}$", "$x=\\operatorname{8}$", "$x=\\pmb{8}$", "$x=\\smash{8}$", "$x=\\overset{*}{8}$", "$x=\\raisebox{1pt}{8}$", "$x=\\boxed 8$", "$x=\\text 8$", "$x=\\mathsf 8$", "$x=\\operatorname*{8}$", "$x=\\smash[t]{8}$", "$x=\\raisebox{1pt}[2pt][3pt]{8}$", "$x=\\frac{0}{1}+\\boxed{8}$", "$x=\\sqrt{0}+\\boxed{8}$", "$x=\\overset{8}{\\phantom{0}}$", "结论：$\\boxed{8}$", "结果：$\\boxed{8}$", "答：$8$", "综上：$\\boxed{8}$", "由此：$\\boxed 8$", "最后写成：$8$", "$|x|=\\boxed{8}$", "$x^2=\\boxed{8}$", "$\\char\"38$", "$\\char56$", "$x=\\char\"38$", "$\\char`8$", "$x=\\char`8$", "$\\verb|8|$", "$x=\\verb+8+$", "$\\def\\?{8}\\?$", "$\\gdef\\?{8}\\?$", "$\\let\\?=8\\?$", deeplyWrapped]) {
      const leaked = structuredClone(lesson) as BoardLesson;
      leaked.blocks[0].content = content;
      leaked.plan!.scenes[0].content = content;
      expect(isBoardLessonSafeForRestore(session, leaked)).toBe(false);
    }

    for (const safeContent of ["$y=8x+1$", "$y=\\mathbf{8x}+1$", "$x=a+b$"]) {
      const safe = structuredClone(lesson) as BoardLesson;
      safe.blocks[0].content = safeContent;
      safe.plan!.scenes[0].content = safeContent;
      expect(isBoardLessonSafeForRestore(session, safe)).toBe(true);
    }

    root.check.answer = "A";
    const letterCoefficient = structuredClone(lesson) as BoardLesson;
    letterCoefficient.blocks[0].content = "$x=a+b$";
    letterCoefficient.plan!.scenes[0].content = "$x=a+b$";
    expect(isBoardLessonSafeForRestore(session, letterCoefficient)).toBe(true);

    const decoratedLetterCoefficient = structuredClone(lesson) as BoardLesson;
    decoratedLetterCoefficient.blocks[0].content = "$x=\\mathbf{a+b}$";
    decoratedLetterCoefficient.plan!.scenes[0].content = "$x=\\mathbf{a+b}$";
    expect(isBoardLessonSafeForRestore(session, decoratedLetterCoefficient)).toBe(true);

    const boxedLetter = structuredClone(lesson) as BoardLesson;
    boxedLetter.blocks[0].content = "$x=\\boxed{A}$";
    boxedLetter.plan!.scenes[0].content = "$x=\\boxed{A}$";
    expect(isBoardLessonSafeForRestore(session, boxedLetter)).toBe(false);

    for (const encodedLetter of ["$\\char\"41$", "$\\char65$", "$\\char`A$"]) {
      const encoded = structuredClone(lesson) as BoardLesson;
      encoded.blocks[0].content = encodedLetter;
      encoded.plan!.scenes[0].content = encodedLetter;
      expect(isBoardLessonSafeForRestore(session, encoded)).toBe(false);
    }
  });

  it("不会把另作射线后的单字母直角绑定到三角形边", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    session.problem.text = "在△ABC中，过A点另作两条互相垂直的射线AD、AE，记∠A=90°。";
    const upgraded = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    const visuals = upgraded.plan!.scenes.flatMap((scene) => scene.visual ? [scene.visual] : []);

    expect(visuals.some((visual) => visual.kind === "geometry_model")).toBe(false);
    expect(visuals.some((visual) => visual.kind === "formula_chain")).toBe(false);

    session.problem.text = "过A点另作互相垂直的射线AD、AE，并把它们的夹角记作∠A；在△ABC中，已知∠A=90°。";
    const crossClause = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    const crossClauseVisuals = crossClause.plan!.scenes.flatMap((scene) => scene.visual ? [scene.visual] : []);
    expect(crossClauseVisuals.some((visual) => visual.kind === "geometry_model" || visual.kind === "formula_chain")).toBe(false);

    session.problem.text = "在△ABC中，已知∠A=90°；注意此处∠A特指三角形外另作射线AD与AE的夹角。";
    const postClause = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    expect(postClause.plan!.scenes.some((scene) => scene.visual?.kind === "geometry_model" || scene.visual?.kind === "formula_chain")).toBe(false);

    session.problem.text = "A角表示射线AD与AE的夹角；在△ABC中，已知∠A=90°。";
    const alternateNotation = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    expect(alternateNotation.plan!.scenes.some((scene) => scene.visual?.kind === "geometry_model" || scene.visual?.kind === "formula_chain")).toBe(false);

    session.problem.text = "在△ABC中，已知∠A=90°，该角特指三角形外另作射线AD与AE的夹角。";
    const sameClause = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    expect(sameClause.plan!.scenes.some((scene) => scene.visual?.kind === "geometry_model" || scene.visual?.kind === "formula_chain")).toBe(false);

    session.problem.text = "在△ABC中，已知∠A=90°，这里的90度指的是三角形外两条线的夹角。";
    const indirectRedefinition = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    expect(indirectRedefinition.plan!.scenes.some((scene) => scene.visual?.kind === "geometry_model" || scene.visual?.kind === "formula_chain")).toBe(false);

    session.problem.text = "在△ABC中，已知∠A=90°，这里的90度与三角形内角无关。";
    const unrelatedDefinition = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    expect(unrelatedDefinition.plan!.scenes.some((scene) => scene.visual?.kind === "geometry_model" || scene.visual?.kind === "formula_chain")).toBe(false);
  });
});
