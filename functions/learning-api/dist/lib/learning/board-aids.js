"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichBoardPlanWithSafeAids = enrichBoardPlanWithSafeAids;
exports.enrichBoardLessonWithSafeAids = enrichBoardLessonWithSafeAids;
exports.isBoardLessonSafeForRestore = isBoardLessonSafeForRestore;
const answer_protection_1 = require("./providers/answer-protection");
function enrichBoardPlanWithSafeAids(session, plan, options = {}) {
    const scenes = plan.scenes.map((scene) => ({ ...scene }));
    const existingKeys = new Set(scenes.flatMap((scene) => scene.visual ? [visualKey(scene.visual)] : []));
    const candidates = options.contextualAids === false ? [lessonPathVisual(plan)] : safeAidCandidates(session, plan);
    const preferredIndexes = {
        concept_graph: 0,
        geometry_model: 1,
        formula_chain: 2,
        function_plot: 2,
    };
    for (const visual of candidates) {
        if (existingKeys.has(visualKey(visual)))
            continue;
        const sameKindCount = scenes.filter((scene) => scene.visual?.kind === visual.kind).length;
        if (visual.kind !== "concept_graph" && sameKindCount > 0 || visual.kind === "concept_graph" && sameKindCount >= 2)
            continue;
        const preferred = Math.min(preferredIndexes[visual.kind], scenes.length - 1);
        const target = scenes[preferred]?.visual ? scenes.findIndex((scene) => !scene.visual) : preferred;
        if (target < 0)
            break;
        scenes[target] = { ...scenes[target], visual };
        existingKeys.add(visualKey(visual));
    }
    return { ...plan, scenes };
}
function enrichBoardLessonWithSafeAids(session, lesson) {
    const plan = lesson.plan ?? safePlanFromLegacyLesson(lesson);
    return { ...lesson, plan: enrichBoardPlanWithSafeAids(session, plan) };
}
function isBoardLessonSafeForRestore(session, lesson) {
    const root = session.nodes.find((node) => node.id === session.rootNodeId);
    const answer = root?.check.answer ?? "";
    // 浏览器持久化的会话会主动抹掉标准答案，无法在本地证明旧板书没有泄露答案。
    // 这类板书必须重新向服务端生成，不能用“不知道答案”冒充“已通过安全校验”。
    if (!answer.trim())
        return false;
    const visibleText = boardLessonVisibleText(lesson);
    const visibleMath = (0, answer_protection_1.normalizedAnswerMath)(visibleText);
    const normalizedAnswer = (0, answer_protection_1.normalizedAnswerMath)(answer);
    if (normalizedAnswer.length >= 2 && (0, answer_protection_1.protectedAnswerVariants)(answer).some((variant) => visibleMath.includes(variant)))
        return false;
    if ((0, answer_protection_1.protectedShortAnswers)(answer).some((candidate) => (0, answer_protection_1.shortProtectedAnswerLeak)(visibleText, candidate, session.problem.text)))
        return false;
    const explanation = (0, answer_protection_1.normalizedAnswerMath)(root?.check.explanation ?? "");
    return explanation.length < 12 || !visibleMath.includes(explanation);
}
function safePlanFromLegacyLesson(lesson) {
    const intents = ["extract", "connect", "derive", "compare", "verify"];
    return {
        learningGoal: lesson.subtitle,
        sourceMessageIds: [],
        scenes: lesson.blocks.map((block, index) => ({ id: block.id, title: block.label, content: block.content, tone: block.tone, intent: intents[index] ?? "verify", sourceMessageIds: [], visual: null })),
    };
}
function safeAidCandidates(session, plan) {
    const triangle = rightTriangleContext(session.problem.text);
    const root = session.nodes.find((node) => node.id === session.rootNodeId);
    if (!root?.check.answer.trim())
        return [lessonPathVisual(plan)];
    if (!triangle)
        return [lessonPathVisual(plan)];
    return [
        lessonPathVisual(plan),
        triangleGeometryVisual(triangle),
        triangleFormulaVisual(triangle),
        triangleConceptVisual(triangle),
    ].filter((visual) => !semanticVisualLeaksAnswer(session, visual));
}
function semanticVisualLeaksAnswer(session, visual) {
    const root = session.nodes.find((node) => node.id === session.rootNodeId);
    const answer = root?.check.answer ?? "";
    const visibleText = semanticVisualText(visual).join("\n");
    const visibleMath = (0, answer_protection_1.normalizedAnswerMath)(visibleText);
    const normalizedAnswer = (0, answer_protection_1.normalizedAnswerMath)(answer);
    if (normalizedAnswer.length >= 2 && (0, answer_protection_1.protectedAnswerVariants)(answer).some((variant) => visibleMath.includes(variant)))
        return true;
    if ((0, answer_protection_1.protectedShortAnswers)(answer).some((candidate) => (0, answer_protection_1.shortProtectedAnswerLeak)(visibleText, candidate, session.problem.text)))
        return true;
    const explanation = (0, answer_protection_1.normalizedAnswerMath)(root?.check.explanation ?? "");
    return explanation.length >= 12 && visibleMath.includes(explanation);
}
function visualKey(visual) {
    return `${visual.kind}:${visual.title}`;
}
function rightTriangleContext(problem) {
    const candidates = problem.split(/[。；;\n]/).flatMap((clause) => {
        const triangles = Array.from(clause.matchAll(/(?:△|三角形)\s*([A-Z])([A-Z])([A-Z])/gi));
        const angles = Array.from(clause.matchAll(/∠\s*([A-Z](?:[A-Z]{2})?)\s*=\s*90\s*(?:°|\\circ|度)/gi));
        return triangles.flatMap((triangle) => angles.flatMap((rightAngle) => {
            const labels = triangle.slice(1, 4).map((label) => label.toUpperCase());
            if (new Set(labels).size !== 3)
                return [];
            const angleName = rightAngle[1].toUpperCase();
            const vertex = angleName.length === 3 ? angleName[1] : angleName;
            if (!labels.includes(vertex))
                return [];
            const others = labels.filter((label) => label !== vertex);
            if (angleName.length === 3 && (new Set([angleName[0], angleName[2]]).size !== 2 || !others.every((label) => angleName.includes(label))))
                return [];
            if (angleName.length === 1 && !singleAngleBoundToTriangle(problem, clause, triangle, rightAngle))
                return [];
            const sides = [`${vertex}${others[0]}`, `${vertex}${others[1]}`];
            const conditions = [rightAngle[0], ...sides.flatMap((side) => {
                    const value = sideValue(clause, side);
                    return value ? [`${side}=${value}`] : [];
                })];
            return [{ triangle: labels.join(""), vertex, sides, conditions, evidence: clause.trim().slice(0, 120) }];
        }));
    });
    return candidates.length === 1 ? candidates[0] : null;
}
function triangleConceptVisual(context) {
    const conditionNodes = context.conditions.map((label, index) => ({ id: `given_${index + 1}`, label, role: "given" }));
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
function lessonPathVisual(plan) {
    const selected = plan.scenes.length <= 4 ? plan.scenes : [plan.scenes[0], plan.scenes[1], plan.scenes[2], plan.scenes[plan.scenes.length - 1]];
    const nodes = selected.map((scene, index) => ({
        id: `stage_${index + 1}`,
        label: scene.title.slice(0, 24),
        role: (index === 0 ? "given" : index === selected.length - 1 ? "check" : index === 1 ? "relation" : "step"),
    }));
    return {
        kind: "concept_graph",
        title: "先看整条学习脉络",
        evidence: `本页板书：${selected.map((scene) => scene.title).join("、")}`,
        caption: "每一块都承接上一块：先辨认信息角色，再连接关系，最后回到检查；可以直接向下阅读，不必逐页解锁。",
        direction: "left-right",
        nodes,
        edges: nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1].id, label: "连接" })),
    };
}
function triangleGeometryVisual(context) {
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
function triangleFormulaVisual(context) {
    const steps = [
        { id: "angle", expression: `$\\angle ${context.vertex}=90^\\circ$`, explanation: "先定位直角顶点。" },
        { id: "perpendicular", expression: `$${context.sides[0]} \\perp ${context.sides[1]}$`, explanation: "直角的两条边互相垂直，这是条件之间最先建立的关系。" },
    ];
    const sideConditions = context.conditions.filter((condition) => condition.includes("=") && !condition.startsWith("∠"));
    if (sideConditions.length)
        steps.push({ id: "lengths", expression: `$${sideConditions.join(",\\quad ")}$`, explanation: "再把题干给出的边长贴回对应的边，不提前计算未知量。" });
    return {
        kind: "formula_chain",
        title: "把条件翻译成可用的数学关系",
        evidence: context.evidence,
        caption: "这不是完整解答，而是把题干语言依次变成能继续思考的关系。",
        steps,
    };
}
function singleAngleBoundToTriangle(problem, clause, triangle, rightAngle) {
    const triangleStart = triangle.index ?? -1;
    const angleStart = rightAngle.index ?? -1;
    if (triangleStart < 0 || angleStart <= triangleStart)
        return false;
    const between = clause.slice(triangleStart + triangle[0].length, angleStart);
    if (!/^\s*(?:中|内)/.test(between))
        return false;
    const afterScope = between.replace(/^\s*(?:中|内)[，,:：\s]*/, "").replace(/[，,:：\s]/g, "");
    const clauseStart = problem.indexOf(clause);
    const vertex = rightAngle[1].toUpperCase();
    const angleMentions = Array.from(problem.matchAll(new RegExp(`(?:∠\\s*${vertex}(?![A-Z])|${vertex}\\s*角)`, "gi")));
    if (angleMentions.length !== 1)
        return false;
    const outsideClause = clauseStart < 0 ? problem : problem.slice(0, clauseStart) + problem.slice(clauseStart + clause.length);
    if (/(?:另作|作出|射线|延长|夹角|特指|记作)/.test(outsideClause))
        return false;
    const afterAngle = clause.slice(angleStart + rightAngle[0].length);
    if (/(?:另作|作出|射线|延长|夹角|特指|外角|不是|并非|指(?:的)?是|记作|无关|不属(?:于)?|不表示|不代表)/.test(afterAngle))
        return false;
    // 单字母角只有在“在△ABC中，∠A=90°”这类直接作用域中才可解释为内角。
    // 一旦中间出现作图、额外射线或其他语义，就不能把 ∠A 擅自绑定为 AB 与 AC 的夹角。
    return /^(?:(?:已知|若|且|其中|有|满足|又知))*$/.test(afterScope);
}
function boardLessonVisibleText(lesson) {
    return [
        lesson.title,
        lesson.subtitle,
        ...lesson.blocks.flatMap((block) => [block.label, block.content]),
        ...lesson.annotations.flatMap((annotation) => [annotation.target, annotation.reason]),
        ...(lesson.visual ? [lesson.visual.title, lesson.visual.evidence, lesson.visual.caption, ...lesson.visual.elements.map((element) => element.label ?? "")] : []),
        ...(lesson.plan ? [lesson.plan.learningGoal, ...lesson.plan.scenes.flatMap((scene) => [scene.title, scene.content, ...semanticVisualText(scene.visual)])] : []),
    ].join("\n");
}
function semanticVisualText(visual) {
    if (!visual)
        return [];
    const common = [visual.title, visual.evidence, visual.caption];
    if (visual.kind === "concept_graph")
        return common.concat(visual.nodes.map((node) => node.label), visual.edges.map((edge) => edge.label ?? ""));
    if (visual.kind === "formula_chain")
        return common.concat(visual.steps.flatMap((step) => [step.expression, step.explanation]));
    if (visual.kind === "geometry_model")
        return common.concat(visual.points.map((point) => point.label), visual.objects.map((object) => "label" in object ? object.label ?? "" : ""));
    return common.concat(visual.series.map((series) => series.label));
}
function sideValue(problem, side) {
    const reversed = `${side[1]}${side[0]}`;
    const match = problem.match(new RegExp(`(?:${side}|${reversed})\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
    return match?.[1] ?? null;
}
