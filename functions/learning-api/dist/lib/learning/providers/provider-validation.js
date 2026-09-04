"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NonRepairableValidationError = exports.PENDING_ORIGINAL_ANSWER = void 0;
exports.parseProblemSolution = parseProblemSolution;
exports.parseInitialAnalysisSelection = parseInitialAnalysisSelection;
exports.expansionSelectionOptions = expansionSelectionOptions;
exports.isRecoverableReasonGroundingError = isRecoverableReasonGroundingError;
exports.parseProblem = parseProblem;
exports.parseTextProblem = parseTextProblem;
exports.parseBoardSuggestion = parseBoardSuggestion;
exports.buildSession = buildSession;
exports.rootOnlySession = rootOnlySession;
exports.pendingChatSession = pendingChatSession;
exports.edgeReason = edgeReason;
exports.assertBlueprintBatchUnique = assertBlueprintBatchUnique;
exports.normalizeBlueprintDetail = normalizeBlueprintDetail;
exports.problemEvidenceSources = problemEvidenceSources;
exports.expansionEvidenceSources = expansionEvidenceSources;
exports.evidenceCandidates = evidenceCandidates;
const curriculum_1 = require("../curriculum");
const graph_1 = require("../graph");
const flow_1 = require("../flow");
const subject_learning_guide_1 = require("../subject-learning-guide");
const types_1 = require("../types");
const problem_evidence_1 = require("../problem-evidence");
const blueprint_1 = require("./blueprint");
exports.PENDING_ORIGINAL_ANSWER = "等待后台核验";
class NonRepairableValidationError extends Error {
}
exports.NonRepairableValidationError = NonRepairableValidationError;
function parseProblemSolution(value) {
    const objects = nestedObjects(value);
    const originalAnswer = firstField(objects, ["originalAnswer", "answer", "standardAnswer", "correctAnswer", "finalAnswer", "resultAnswer", "标准答案", "答案"]);
    const originalExplanation = firstField(objects, ["originalExplanation", "explanation", "solutionExplanation", "solution", "analysis", "reasoning", "steps", "rationale", "解题依据", "解析", "解法", "推理过程"]);
    if (!originalAnswer || !originalExplanation)
        throw new Error("缺少原题标准答案或解题依据");
    return { originalAnswer, originalExplanation };
}
function nestedObjects(root) {
    const firstLevel = Object.values(root).filter((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item));
    const secondLevel = firstLevel.flatMap((item) => Object.values(item).filter((nested) => Boolean(nested) && typeof nested === "object" && !Array.isArray(nested)));
    return [root, ...firstLevel, ...secondLevel];
}
function firstField(objects, keys) {
    for (const object of objects) {
        for (const key of keys) {
            const value = object[key];
            if (typeof value === "string" && value.trim())
                return value.trim();
            if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
                const joined = value.map((item) => item.trim()).filter(Boolean).join("；");
                if (joined)
                    return joined;
            }
        }
    }
    return "";
}
function parseInitialAnalysisSelection(value, problem, allowed) {
    const selections = (0, blueprint_1.parseKnowledgeSelections)(value, {
        allowedConceptIds: allowed.map((item) => item.id), evidenceSources: problemEvidenceSources(problem),
        min: 1, max: 4, rejectAncestorPairs: true,
    });
    if (typeof value.originalAnswer !== "string" || !value.originalAnswer.trim() || typeof value.originalExplanation !== "string" || !value.originalExplanation.trim())
        throw new Error("缺少原题标准答案或解题依据");
    return {
        selections, originalAnswer: value.originalAnswer, originalExplanation: value.originalExplanation,
        problemGuide: (0, blueprint_1.parseProblemGuide)(value.problemGuide, problem.text, selections.filter((item) => item.evidenceSource === "problem").map((item) => item.evidence), value.originalAnswer, value.originalExplanation, (0, subject_learning_guide_1.subjectPendingGuide)(problem)),
    };
}
function expansionSelectionOptions(problem, target, allowedConceptIds) {
    return { allowedConceptIds, evidenceSources: expansionEvidenceSources(problem, target), min: 1, max: allowedConceptIds.length };
}
function isRecoverableReasonGroundingError(error) {
    return error instanceof Error && error.message.includes("简化理由没有联系已引用的真实原文");
}
function parseProblem(result) {
    if (result.recognized !== true) {
        const reason = typeof result.failureReason === "string" && result.failureReason.trim() ? `：${result.failureReason.trim()}` : "";
        throw new NonRepairableValidationError(`照片中没有识别到清晰完整的一道题${reason}，请重新拍摄并只保留题目区域`);
    }
    if (typeof result.text !== "string" || result.text.trim().length < 3)
        throw new Error("没有识别到完整题干");
    const subject = normalizedSubject(result.subject);
    const recognizedBand = normalizedGradeBand(result.gradeBand);
    const confidence = normalizedConfidence(result.confidence);
    if (typeof result.childWork !== "string")
        throw new Error("模型识别结果缺少学生已有作答字段");
    if (!subject)
        throw new Error("模型识别结果中的学科不合法");
    if (!recognizedBand)
        throw new Error("模型识别结果中的学段不合法");
    if (confidence === null)
        throw new Error("模型识别结果中的置信度不合法");
    if (confidence < 0.55)
        throw new NonRepairableValidationError("照片识别置信度过低，请重新拍摄并确保题干清晰、完整、无反光");
    const gradeBand = (0, curriculum_1.normalizeSubjectBand)(subject, recognizedBand);
    const visualContext = (0, problem_evidence_1.parseProblemVisualContext)(result.visualContext);
    if (!visualContext)
        throw new Error("照片识别结果缺少题图相关性判断");
    if (!visualContext.related && /(?:如图|见图|下图|图中|根据图|观察图)/.test(result.text))
        throw new Error("题干明确指向配图，但题图相关性判断为不相关");
    if (visualContext.related && visualContext.affectsSolving && visualContext.confidence < 0.55)
        throw new NonRepairableValidationError("题图中的关键条件无法可靠识别，请重新拍摄并确保题干和配图完整清晰");
    return { text: result.text.trim(), childWork: result.childWork.trim(), subject, gradeBand, confidence, userRevised: false, visualContext };
}
function parseTextProblem(result, originalText) {
    if (result.recognized !== true) {
        const reason = typeof result.failureReason === "string" && result.failureReason.trim() ? `：${result.failureReason.trim()}` : "";
        throw new NonRepairableValidationError(`没有识别到一道完整的题目${reason}`);
    }
    const subject = normalizedSubject(result.subject);
    const recognizedBand = normalizedGradeBand(result.gradeBand);
    const confidence = normalizedConfidence(result.confidence);
    if (!subject || !recognizedBand || confidence === null)
        throw new Error("模型分类结果结构不合法");
    const gradeBand = (0, curriculum_1.normalizeSubjectBand)(subject, recognizedBand);
    return { text: originalText.trim(), childWork: "", subject, gradeBand, confidence, userRevised: true };
}
function normalizedSubject(value) {
    const aliases = { math: "math", mathematics: "math", 数学: "math", physics: "physics", 物理: "physics", chemistry: "chemistry", 化学: "chemistry", biology: "biology", 生物: "biology", chinese: "chinese", 语文: "chinese", english: "english", 英语: "english", history: "history", 历史: "history", geography: "geography", 地理: "geography", politics: "politics", 政治: "politics", 道德与法治: "politics" };
    const normalized = aliases[String(value ?? "").trim().toLowerCase()];
    return normalized && types_1.subjects.includes(normalized) ? normalized : null;
}
function normalizedGradeBand(value) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (/小学|primary|elementary/.test(raw))
        return "primary";
    if (/初中|junior|middle school/.test(raw))
        return "junior";
    if (/高中|senior|high school/.test(raw))
        return "senior";
    return null;
}
function normalizedConfidence(value) {
    const confidence = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null;
}
function parseBoardSuggestion(result) {
    if (typeof result.recommended !== "boolean" || typeof result.reason !== "string" || result.reason.trim().length < 6 || result.reason.trim().length > 100 || !["relation", "steps", "comparison", "formula"].includes(String(result.layout)))
        throw new Error("板书呈现判断结构不合法");
    return { recommended: result.recommended, reason: result.reason.trim(), layout: result.layout };
}
function buildSession(problem, provider, reasoningLevel, modelId, blueprints, originalAnswer, originalExplanation, problemGuide) {
    const root = (0, blueprint_1.createProblemRoot)(problem, originalAnswer, originalExplanation);
    const nodes = blueprints.map(blueprint_1.knowledgeNodeFromBlueprint);
    const now = new Date().toISOString();
    const session = {
        schemaVersion: "1.1", provider, reasoningLevel, modelId, mode: "live",
        requestId: `req-${crypto.randomUUID().slice(0, 8)}`, problem, problemGuide, flow: (0, flow_1.createInitialFlow)(),
        nodes: [root, ...nodes], edges: nodes.map((node, index) => ({ from: node.id, to: root.id, reason: edgeReason(node, blueprints[index], "原题") })),
        rootNodeId: root.id, currentNodeId: nodes.slice().sort((a, b) => a.difficulty - b.difficulty)[0]?.id ?? null,
        stage: "diagnosing", evidence: [], transferCheck: null, originalPassed: false, transferPassed: false, createdAt: now, updatedAt: now,
    };
    (0, graph_1.assertGraphInvariants)(session);
    return session;
}
function rootOnlySession(session) {
    const root = session.nodes.find((node) => node.id === session.rootNodeId);
    if (!root)
        throw new Error("学习会话缺少原题节点");
    return { ...session, nodes: [root], edges: [], currentNodeId: null };
}
function pendingChatSession(problem, provider, reasoningLevel, modelId, mode) {
    return { ...buildSession(problem, provider, reasoningLevel, modelId, [], exports.PENDING_ORIGINAL_ANSWER, "标准解正在与首讲并行准备。", (0, subject_learning_guide_1.subjectPendingGuide)(problem)), mode };
}
function edgeReason(node, blueprint, targetTitle) {
    const evidence = blueprint?.evidence ?? node.diagnosticEvidence ?? node.title;
    return `“${evidence}”表明${node.title}是理解${targetTitle}所需的直接前置`;
}
function assertBlueprintBatchUnique(blueprints) {
    const checks = new Set();
    const content = new Set();
    for (const blueprint of blueprints) {
        const check = (0, blueprint_1.blueprintCheckSignature)(blueprint);
        const signature = (0, blueprint_1.blueprintContentSignature)(blueprint);
        if (checks.has(check))
            throw new Error(`模型为多个知识点生成了重复检查题：${blueprint.check.prompt}`);
        if (content.has(signature))
            throw new Error(`模型为多个知识点生成了重复教学内容：${blueprint.conceptId}`);
        checks.add(check);
        content.add(signature);
    }
}
function normalizeBlueprintDetail(value, expectedConceptId) {
    const matches = findBlueprintDetails(value, 0);
    if (matches.length > 1)
        throw new Error("模型返回了多个教学节点，无法确认哪一个属于当前概念");
    const nested = matches[0];
    if (nested) {
        if (nested.conceptId !== undefined && nested.conceptId !== expectedConceptId)
            throw new Error("教学内容对应了错误的课程概念");
        return nested;
    }
    if (value.check && typeof value.check === "object" && !Array.isArray(value.check)) {
        const explanation = typeof value.teaching === "string" ? value.teaching : typeof value.explanation === "string" ? value.explanation : undefined;
        if (explanation)
            return { teaching: { explanation, example: value.example, parentPrompt: value.parentPrompt, expectedSignal: value.expectedSignal, misconception: value.misconception, alternateExplanation: value.alternateExplanation }, check: value.check };
    }
    return value;
}
function findBlueprintDetails(value, depth) {
    if (!value || typeof value !== "object" || depth > 3)
        return [];
    if (Array.isArray(value))
        return value.flatMap((item) => findBlueprintDetails(item, depth + 1));
    const object = value;
    if (object.teaching && typeof object.teaching === "object" && !Array.isArray(object.teaching) && object.check && typeof object.check === "object" && !Array.isArray(object.check))
        return [object];
    return Object.values(object).flatMap((child) => findBlueprintDetails(child, depth + 1));
}
function problemEvidenceSources(problem) {
    return [
        { type: "problem", text: problem.text },
        ...(0, problem_evidence_1.visualEvidenceTexts)(problem).map((text) => ({ type: "problem", text })),
        ...(problem.childWork ? [{ type: "child_work", text: problem.childWork }] : []),
    ];
}
function expansionEvidenceSources(problem, target) {
    return [...problemEvidenceSources(problem), { type: "parent", text: target.title }, { type: "parent", text: target.simplification }, { type: "parent", text: target.teaching.explanation }];
}
function evidenceCandidates(sources) {
    const candidates = sources.flatMap((source) => {
        const parts = source.text.split(/[，。；：？！,;:?!\n]+/).map((part) => part.trim()).filter((part) => part.length >= 2 && part.length <= 50);
        return [...(source.text.trim().length <= 50 ? [{ ...source, text: source.text.trim() }] : []), ...parts.map((text) => ({ ...source, text }))];
    });
    return candidates.filter((candidate, index) => candidates.findIndex((item) => item.type === candidate.type && item.text === candidate.text) === index).slice(0, 16);
}
