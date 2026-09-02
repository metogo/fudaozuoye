import type { BoardComparisonVisual, BoardConceptVisual, BoardEvidenceChainVisual, BoardFormulaVisual, BoardGeometryVisual, BoardLesson, BoardPlan, BoardProcessVisual, BoardSemanticVisual, BoardTimelineVisual, LearningSession } from "./types";
import { explicitAnswerClaimLeak, isShortTextAnswer, normalizedAnswerMath, protectedAnswerVariants, protectedShortAnswers, shortProtectedAnswerLeak, shortTextAnswerLeak } from "./providers/answer-protection";
import { sortChronology } from "./board-chronology";
import { isTaskInstructionText } from "./board-evidence";
import { createMathBoardAids, createMathBoardContent } from "./board-math-content";

export function enrichBoardPlanWithSafeAids(session: LearningSession, plan: BoardPlan, options: { contextualAids?: boolean } = {}): BoardPlan {
  const scenes = plan.scenes.map((scene) => ({ ...scene }));
  let visualCount = scenes.filter((scene) => scene.visual).length;
  const existingKeys = new Set(scenes.flatMap((scene) => scene.visual ? [visualKey(scene.visual)] : []));
  const candidates = options.contextualAids === false ? [] : safeAidCandidates(session, plan);
  const preferredRoles: Record<BoardSemanticVisual["kind"], string[]> = {
    concept_graph: ["model", "orient"],
    geometry_model: ["model", "reason"],
    formula_chain: ["reason", "model"],
    function_plot: ["model", "reason"],
    evidence_chain: ["orient", "model", "reason"],
    timeline: ["orient", "model"],
    process_flow: ["model", "reason"],
    comparison_matrix: ["misconception", "transfer", "reason"],
  };
  for (const visual of candidates) {
    if (visualCount >= 2) break;
    if (existingKeys.has(visualKey(visual))) continue;
    const sameKindCount = scenes.filter((scene) => scene.visual?.kind === visual.kind).length;
    if (visual.kind !== "concept_graph" && sameKindCount > 0 || visual.kind === "concept_graph" && sameKindCount >= 2) continue;
    const targetByPurpose = preferredRoles[visual.kind]
      .map((role) => scenes.findIndex((scene) => scene.role === role && !scene.visual))
      .find((index) => index !== undefined && index >= 0);
    const target = targetByPurpose ?? scenes.findIndex((scene) => !scene.visual);
    if (target < 0) break;
    scenes[target] = { ...scenes[target], visual };
    existingKeys.add(visualKey(visual));
    visualCount += 1;
  }
  return { ...plan, scenes };
}

export function enrichBoardLessonWithSafeAids(session: LearningSession, lesson: BoardLesson): BoardLesson {
  const plan = lesson.plan ?? safePlanFromLegacyLesson(lesson);
  return { ...lesson, plan: enrichBoardPlanWithSafeAids(session, plan) };
}

export function isBoardLessonSafeForRestore(session: LearningSession, lesson: BoardLesson): boolean {
  const root = session.nodes.find((node) => node.id === session.rootNodeId);
  const answer = root?.check.answer ?? "";
  // 浏览器持久化的会话会主动抹掉标准答案，无法在本地证明旧板书没有泄露答案。
  // 这类板书必须重新向服务端生成，不能用“不知道答案”冒充“已通过安全校验”。
  if (!answer.trim()) return false;
  const visibleText = boardLessonVisibleText(lesson);
  const visibleMath = normalizedAnswerMath(visibleText);
  const normalizedAnswer = normalizedAnswerMath(answer);
  const answerAlreadyInProblem = normalizedAnswer.length >= 2 && normalizedAnswerMath(session.problem.text).includes(normalizedAnswer);
  if (!answerAlreadyInProblem && !isShortTextAnswer(answer) && normalizedAnswer.length >= 2 && protectedAnswerVariants(answer).some((variant) => visibleMath.includes(variant))) return false;
  if (explicitAnswerClaimLeak(visibleText, answer)) return false;
  if (shortTextAnswerLeak(visibleText, answer, session.problem.text)) return false;
  if (protectedShortAnswers(answer).some((candidate) => shortProtectedAnswerLeak(visibleText, candidate, session.problem.text))) return false;
  const explanation = normalizedAnswerMath(root?.check.explanation ?? "");
  return explanation.length < 12 || !visibleMath.includes(explanation);
}

function safePlanFromLegacyLesson(lesson: BoardLesson): BoardPlan {
  const intents = ["extract", "connect", "derive", "compare", "verify"] as const;
  return {
    learningGoal: lesson.subtitle,
    sourceMessageIds: [],
    scenes: lesson.blocks.map((block, index) => ({ id: block.id, title: block.label, content: block.content, tone: block.tone, intent: intents[index] ?? "verify", sourceMessageIds: [], visual: null })),
  };
}

function safeAidCandidates(session: LearningSession, plan: BoardPlan): BoardSemanticVisual[] {
  const mathContent = session.problem.subject === "math" ? createMathBoardContent(session.problem.text) : null;
  const triangle = rightTriangleContext(session.problem.text);
  const root = session.nodes.find((node) => node.id === session.rootNodeId);
  if (!root?.check.answer.trim()) return [];
  const native = subjectNativeAid(session, plan);
  const candidates = mathContent
    ? [...createMathBoardAids(mathContent), native]
    : triangle ? [triangleGeometryVisual(triangle), triangleFormulaVisual(triangle), triangleConceptVisual(triangle), native] : [native];
  return candidates.filter((visual): visual is BoardSemanticVisual => Boolean(visual) && !semanticVisualLeaksAnswer(session, visual!));
}

function subjectNativeAid(session: LearningSession, plan: BoardPlan): BoardSemanticVisual | null {
  const comparison = comparisonFromProblem(session.problem.text);
  if (comparison) return comparison;
  if (session.problem.subject === "history") return timelineFromProblem(session.problem.text) ?? evidenceChainFromPlan(plan);
  if (session.problem.subject === "chinese" || session.problem.subject === "english" || session.problem.subject === "politics") return evidenceChainFromPlan(plan);
  return processFlowFromPlan(plan);
}

function comparisonFromProblem(problem: string): BoardComparisonVisual | null {
  const clause = problem.split(/[。！？!?；;\n]/).map((item) => item.trim()).find((item) => /(?:比较|对比|异同|difference|compare)/i.test(item));
  if (!clause) return null;
  const match = clause.match(/(?:比较|对比)\s*([^，。；]{1,18}?)\s*(?:与|和)\s*([^，。；]{1,18}?)(?:的)?(?:异同|区别|共同点|$)/) ?? clause.match(/compare\s+(.{1,18}?)\s+(?:with|and)\s+(.{1,18}?)(?:[.。]|$)/i);
  if (!match) return null;
  const left = match[1].trim();
  const right = match[2].trim();
  if (!left || !right || left === right) return null;
  return {
    kind: "comparison_matrix",
    title: "先统一比较维度",
    evidence: clause,
    caption: "矩阵只规定比较口径，不预填材料没有给出的异同；每个单元格都要回到原文取证。",
    columns: [left, right],
    rows: [
      { id: "compare_basis", aspect: "材料依据", left: `只摘录涉及${left}的原文`, right: `只摘录涉及${right}的原文` },
      { id: "compare_scope", aspect: "同一尺度", left: "按题目要求的维度判断", right: "按同一维度判断" },
    ],
  };
}

function evidenceChainFromPlan(plan: BoardPlan): BoardEvidenceChainVisual | null {
  const seen = new Set<string>();
  const links = plan.scenes.filter((scene) => {
    const key = compactEvidence(scene.evidence ?? "");
    if (!scene.evidence || !scene.purpose || isTaskInstructionText(scene.evidence) || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4).map((scene, index) => ({ id: `evidence_${index + 1}`, quote: scene.evidence!, meaning: scene.purpose! }));
  if (links.length < 2) return null;
  return { kind: "evidence_chain", title: "证据怎样支撑判断", evidence: links[0].quote, caption: "左侧保留原题证据，右侧只写它在当前判断中承担的作用，避免结论脱离材料。", links };
}

function processFlowFromPlan(plan: BoardPlan): BoardProcessVisual | null {
  const seen = new Set<string>();
  const steps = plan.scenes.filter((scene) => {
    const key = compactEvidence(scene.evidence ?? "");
    if (!scene.evidence || isTaskInstructionText(scene.evidence) || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5).map((scene, index) => ({ id: `process_${index + 1}`, label: scene.title, evidence: scene.evidence! }));
  if (steps.length < 2) return null;
  return { kind: "process_flow", title: "沿学科动作推进", evidence: steps[0].evidence, caption: "每一步都保留题目依据；箭头表示思考顺序，不代表材料未给出的因果。", steps };
}

function timelineFromProblem(problem: string): BoardTimelineVisual | null {
  const clauses = problem.split(/(?<=[。！？!?；;])/).map((item) => item.trim()).filter((item) => Boolean(item) && !isTaskInstructionText(item));
  const events = clauses.flatMap((clause, index) => {
    const time = clause.match(/(?:公元前\s*)?\d{2,4}\s*(?:年|世纪)|(?:春秋|战国)(?:时期)?|(?:秦|汉|唐|宋|元|明|清)(?:朝|代)/)?.[0];
    return time ? [{ id: `event_${index + 1}`, time, event: clause }] : [];
  });
  if (events.length < 2) return null;
  const ordered = sortChronology(events)?.slice(0, 6);
  if (!ordered) return null;
  return { kind: "timeline", title: "先把史料放回时序", evidence: ordered[0].event, caption: "时间线只排列材料明确给出的事件；先后关系本身不等于因果关系。", events: ordered };
}

function compactEvidence(value: string): string { return value.normalize("NFKC").replace(/[\s，。；：、“”‘’（）()\[\]【】]/g, "").toLowerCase(); }

function semanticVisualLeaksAnswer(session: LearningSession, visual: BoardSemanticVisual): boolean {
  const root = session.nodes.find((node) => node.id === session.rootNodeId);
  const answer = root?.check.answer ?? "";
  const visibleText = semanticVisualText(visual).join("\n");
  const visibleMath = normalizedAnswerMath(visibleText);
  const normalizedAnswer = normalizedAnswerMath(answer);
  if (normalizedAnswer.length >= 2 && protectedAnswerVariants(answer).some((variant) => visibleMath.includes(variant))) return true;
  if (protectedShortAnswers(answer).some((candidate) => shortProtectedAnswerLeak(visibleText, candidate, session.problem.text))) return true;
  const explanation = normalizedAnswerMath(root?.check.explanation ?? "");
  return explanation.length >= 12 && visibleMath.includes(explanation);
}

function visualKey(visual: BoardSemanticVisual): string {
  return `${visual.kind}:${visual.title}`;
}

interface RightTriangleContext {
  triangle: string;
  vertex: string;
  sides: [string, string];
  conditions: string[];
  evidence: string;
}

function rightTriangleContext(problem: string): RightTriangleContext | null {
  const candidates = problem.split(/[。；;\n]/).flatMap((clause) => {
    const triangles = Array.from(clause.matchAll(/(?:△|三角形)\s*([A-Z])([A-Z])([A-Z])/gi));
    const angles = Array.from(clause.matchAll(/∠\s*([A-Z](?:[A-Z]{2})?)\s*=\s*90\s*(?:°|\\circ|度)/gi));
    return triangles.flatMap((triangle) => angles.flatMap((rightAngle) => {
      const labels = triangle.slice(1, 4).map((label) => label.toUpperCase());
      if (new Set(labels).size !== 3) return [];
      const angleName = rightAngle[1].toUpperCase();
      const vertex = angleName.length === 3 ? angleName[1] : angleName;
      if (!labels.includes(vertex)) return [];
      const others = labels.filter((label) => label !== vertex);
      if (angleName.length === 3 && (new Set([angleName[0], angleName[2]]).size !== 2 || !others.every((label) => angleName.includes(label)))) return [];
      if (angleName.length === 1 && !singleAngleBoundToTriangle(problem, clause, triangle, rightAngle)) return [];
      const sides = [`${vertex}${others[0]}`, `${vertex}${others[1]}`] as [string, string];
      const conditions = [rightAngle[0], ...sides.flatMap((side) => {
        const value = sideValue(clause, side);
        return value ? [`${side}=${value}`] : [];
      })];
      return [{ triangle: labels.join(""), vertex, sides, conditions, evidence: clause.trim().slice(0, 120) } satisfies RightTriangleContext];
    }));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function triangleConceptVisual(context: RightTriangleContext): BoardConceptVisual {
  const conditionNodes = context.conditions.map((label, index) => ({ id: `given_${index + 1}`, label, role: "given" as const }));
  return {
    kind: "concept_graph",
    title: "三个条件怎样汇到同一个图形里",
    evidence: context.evidence,
    caption: "先把角和边长分别放回三角形，再看它们共同限定了什么；这条脉络只整理已知，不计算最终结果。",
    direction: "left-right",
    nodes: [...conditionNodes, { id: "relation", label: `直角三角形${context.triangle}`, role: "relation" }, { id: "check", label: "检查位置关系", role: "check" }],
    edges: [...conditionNodes.map((node) => ({ from: node.id, to: "relation", label: "对应" })), { from: "relation", to: "check", label: "检查" }],
  };
}


function triangleGeometryVisual(context: RightTriangleContext): BoardGeometryVisual {
  const labels = context.triangle.split("");
  const others = labels.filter((label) => label !== context.vertex);
  return {
    kind: "geometry_model",
    title: "把直角、两条边放回同一张图",
    evidence: context.evidence,
    caption: "拖动或缩放图形，观察直角顶点与两条相邻边的对应；示意图不代表真实比例。",
    points: labels.map((label) => ({ id: label, label })),
    objects: [
      { type: "segment", from: labels[0], to: labels[1] },
      { type: "segment", from: labels[1], to: labels[2] },
      { type: "segment", from: labels[2], to: labels[0] },
      { type: "right_angle", vertex: context.vertex, from: others[0], to: others[1] },
    ],
  };
}

function triangleFormulaVisual(context: RightTriangleContext): BoardFormulaVisual {
  const steps: BoardFormulaVisual["steps"] = [
    { id: "angle", expression: `$\\angle ${context.vertex}=90^\\circ$`, explanation: "先定位直角顶点。" },
    { id: "perpendicular", expression: `$${context.sides[0]} \\perp ${context.sides[1]}$`, explanation: "直角的两条边互相垂直，这是条件之间最先建立的关系。" },
  ];
  const sideConditions = context.conditions.filter((condition) => condition.includes("=" ) && !condition.startsWith("∠"));
  if (sideConditions.length) steps.push({ id: "lengths", expression: `$${sideConditions.join(",\\quad ")}$`, explanation: "再把题干给出的边长贴回对应的边，不提前计算未知量。" });
  return {
    kind: "formula_chain",
    title: "把条件翻译成可用的数学关系",
    evidence: context.evidence,
    caption: "这不是完整解答，而是把题干语言依次变成能继续思考的关系。",
    steps,
  };
}

function singleAngleBoundToTriangle(problem: string, clause: string, triangle: RegExpMatchArray, rightAngle: RegExpMatchArray): boolean {
  const triangleStart = triangle.index ?? -1;
  const angleStart = rightAngle.index ?? -1;
  if (triangleStart < 0 || angleStart <= triangleStart) return false;
  const between = clause.slice(triangleStart + triangle[0].length, angleStart);
  if (!/^\s*(?:中|内)/.test(between)) return false;
  const afterScope = between.replace(/^\s*(?:中|内)[，,:：\s]*/, "").replace(/[，,:：\s]/g, "");
  const clauseStart = problem.indexOf(clause);
  const vertex = rightAngle[1].toUpperCase();
  const angleMentions = Array.from(problem.matchAll(new RegExp(`(?:∠\\s*${vertex}(?![A-Z])|${vertex}\\s*角)`, "gi")));
  if (angleMentions.length !== 1) return false;
  const outsideClause = clauseStart < 0 ? problem : problem.slice(0, clauseStart) + problem.slice(clauseStart + clause.length);
  if (/(?:另作|作出|射线|延长|夹角|特指|记作)/.test(outsideClause)) return false;
  const afterAngle = clause.slice(angleStart + rightAngle[0].length);
  if (/(?:另作|作出|射线|延长|夹角|特指|外角|不是|并非|指(?:的)?是|记作|无关|不属(?:于)?|不表示|不代表)/.test(afterAngle)) return false;
  // 单字母角只有在“在△ABC中，∠A=90°”这类直接作用域中才可解释为内角。
  // 一旦中间出现作图、额外射线或其他语义，就不能把 ∠A 擅自绑定为 AB 与 AC 的夹角。
  return /^(?:(?:已知|若|且|其中|有|满足|又知))*$/.test(afterScope);
}

function boardLessonVisibleText(lesson: BoardLesson): string {
  return [
    lesson.title,
    lesson.subtitle,
    lesson.returnLabel,
    lesson.quality?.reason ?? "",
    ...lesson.blocks.flatMap((block) => [block.label, block.content]),
    ...lesson.annotations.flatMap((annotation) => [annotation.target, annotation.reason]),
    ...(lesson.visual ? [lesson.visual.title, lesson.visual.evidence, lesson.visual.caption, ...lesson.visual.elements.map((element) => element.label ?? "")] : []),
    ...(lesson.plan ? [lesson.plan.thesis ?? "", lesson.plan.learningGoal, ...lesson.plan.scenes.flatMap((scene) => [scene.title, scene.content, scene.purpose ?? "", scene.evidence ?? "", scene.why ?? "", scene.selfCheck ?? "", ...semanticVisualText(scene.visual)])] : []),
  ].join("\n");
}

function semanticVisualText(visual?: BoardSemanticVisual | null): string[] {
  if (!visual) return [];
  const common = [visual.title, visual.evidence, visual.caption];
  if (visual.kind === "concept_graph") return common.concat(visual.nodes.map((node) => node.label), visual.edges.map((edge) => edge.label ?? ""));
  if (visual.kind === "formula_chain") return common.concat(visual.steps.flatMap((step) => [step.expression, step.explanation]));
  if (visual.kind === "geometry_model") return common.concat(visual.points.map((point) => point.label), visual.objects.map((object) => "label" in object ? object.label ?? "" : ""));
  if (visual.kind === "function_plot") return common.concat(visual.series.map((series) => series.label));
  if (visual.kind === "evidence_chain") return common.concat(visual.links.flatMap((link) => [link.quote, link.meaning]));
  if (visual.kind === "timeline") return common.concat(visual.events.flatMap((event) => [event.time, event.event]));
  if (visual.kind === "process_flow") return common.concat(visual.steps.flatMap((step) => [step.label, step.evidence]));
  return common.concat(visual.columns, visual.rows.flatMap((row) => [row.aspect, row.left, row.right]));
}

function sideValue(problem: string, side: string): string | null {
  const reversed = `${side[1]}${side[0]}`;
  const match = problem.match(new RegExp(`(?:${side}|${reversed})\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
  return match?.[1] ?? null;
}
