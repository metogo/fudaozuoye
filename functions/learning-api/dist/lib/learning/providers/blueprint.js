"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseKnowledgeSelections = parseKnowledgeSelections;
exports.parseKnowledgeBlueprints = parseKnowledgeBlueprints;
exports.knowledgeNodeFromBlueprint = knowledgeNodeFromBlueprint;
exports.createProblemRoot = createProblemRoot;
exports.blueprintContentSignature = blueprintContentSignature;
exports.blueprintCheckSignature = blueprintCheckSignature;
const curriculum_1 = require("../curriculum");
function parseKnowledgeSelections(result, options) {
    const rawSelections = Array.isArray(result.selections) ? result.selections : Array.isArray(result.nodes) ? result.nodes : null;
    if (!rawSelections)
        throw new Error("模型没有返回知识选择列表 selections");
    if (rawSelections.length < options.min || rawSelections.length > options.max) {
        throw new Error(`知识选择数量必须在 ${options.min} 到 ${options.max} 个之间`);
    }
    const allowed = new Set(options.allowedConceptIds);
    const seen = new Set();
    const selections = rawSelections.map((raw, index) => {
        const value = asObject(raw, `第 ${index + 1} 个知识选择`);
        const draft = {
            conceptId: requiredString(value, "conceptId", 3, 120),
            evidence: requiredString(value, "evidence", 2, 50),
            simplification: requiredString(value, "simplification", 12, 160),
        };
        if (!allowed.has(draft.conceptId))
            throw new Error(`知识选择不在允许的课程目录中：${draft.conceptId}`);
        if (seen.has(draft.conceptId))
            throw new Error(`模型重复选择知识点：${draft.conceptId}`);
        const evidenceSource = validateSelectionGrounding(draft, options.evidenceSources);
        seen.add(draft.conceptId);
        return { ...draft, evidenceSource };
    });
    if (options.rejectAncestorPairs)
        assertSelectionAntichain(selections);
    return selections;
}
function parseKnowledgeBlueprints(result, options) {
    if (!Array.isArray(result.nodes))
        throw new Error("模型没有返回节点蓝图列表 nodes");
    if (result.nodes.length < options.min || result.nodes.length > options.max) {
        throw new Error(`节点数量必须在 ${options.min} 到 ${options.max} 个之间`);
    }
    const allowed = new Set(options.allowedConceptIds);
    const seenConcepts = new Set();
    const seenChecks = new Set((options.existingCheckPrompts ?? []).map(normalize));
    const seenContent = new Set(options.existingContentSignatures ?? []);
    return result.nodes.map((raw, index) => {
        const blueprint = parseBlueprint(asObject(raw, `第 ${index + 1} 个节点`));
        if (!allowed.has(blueprint.conceptId))
            throw new Error(`节点不在允许的课程目录中：${blueprint.conceptId}`);
        if (seenConcepts.has(blueprint.conceptId))
            throw new Error(`模型重复返回知识点：${blueprint.conceptId}`);
        validateGrounding(blueprint, options.evidenceSources);
        validateCheck(blueprint, options.evidenceSources, seenChecks);
        const signature = contentSignature(blueprint);
        if (seenContent.has(signature))
            throw new Error(`节点内容重复：${blueprint.conceptId}`);
        seenConcepts.add(blueprint.conceptId);
        seenChecks.add(normalize(blueprint.check.prompt));
        seenContent.add(signature);
        return blueprint;
    });
}
function knowledgeNodeFromBlueprint(blueprint) {
    const concept = (0, curriculum_1.getConcept)(blueprint.conceptId);
    if (!concept)
        throw new Error(`课程目录中不存在知识点：${blueprint.conceptId}`);
    return {
        id: uid("node"),
        conceptId: concept.id,
        title: concept.title,
        kind: "concept",
        difficulty: concept.difficulty,
        atomic: concept.atomic,
        curriculumVersion: concept.version,
        simplification: blueprint.simplification,
        diagnosticEvidence: blueprint.evidence,
        diagnosticEvidenceSource: blueprint.evidenceSource,
        state: "unchecked",
        attempts: 0,
        teaching: blueprint.teaching,
        check: { ...blueprint.check, id: uid("check"), conceptId: concept.id },
    };
}
function createProblemRoot(problem, answer, explanation) {
    return {
        id: uid("root"),
        conceptId: `problem.${problem.subject}`,
        title: "原题",
        kind: "problem",
        difficulty: 10,
        atomic: false,
        curriculumVersion: problem.gradeBand === "senior" ? "cn-highschool-2017-2020" : "cn-compulsory-2022",
        simplification: "从原题倒推必须掌握的直接知识。",
        diagnosticEvidence: problem.text,
        state: "unchecked",
        attempts: 0,
        teaching: {
            explanation: "前置知识已经走通，请让孩子不看提示独立重做。",
            example: "先收起之前的讲解，再从题干独立判断关系。",
            parentPrompt: "你能不看刚才的步骤，解释为什么这样做吗？",
            expectedSignal: "孩子能独立写出关键关系、计算过程和结论。",
            misconception: "照抄刚才步骤但不能说明数量或学科关系。",
            alternateExplanation: "请孩子先口述思路，再独立写出完整过程。",
        },
        check: {
            id: uid("original"),
            prompt: `现在请孩子独立重做原题：${problem.text}`,
            type: "short_text",
            answer: answer.trim(),
            explanation: explanation.trim(),
        },
    };
}
function blueprintContentSignature(blueprint) {
    return contentSignature(blueprint);
}
function parseBlueprint(value) {
    const conceptId = requiredString(value, "conceptId", 3, 120);
    const evidence = requiredString(value, "evidence", 2, 50);
    const evidenceSource = requiredEvidenceSource(value.evidenceSource);
    const simplification = requiredString(value, "simplification", 12, 160);
    const teachingValue = asObject(value.teaching, `节点 ${conceptId} 的 teaching`);
    const checkValue = asObject(value.check, `节点 ${conceptId} 的 check`);
    const teaching = {
        explanation: requiredString(teachingValue, "explanation", 12, 140),
        example: requiredString(teachingValue, "example", 8, 110),
        parentPrompt: requiredString(teachingValue, "parentPrompt", 6, 70),
        expectedSignal: requiredString(teachingValue, "expectedSignal", 6, 90),
        misconception: requiredString(teachingValue, "misconception", 6, 100),
        alternateExplanation: requiredString(teachingValue, "alternateExplanation", 8, 140),
    };
    const requestedType = checkValue.type;
    if (requestedType !== "choice" && requestedType !== "short_text")
        throw new Error(`节点 ${conceptId} 的检查题类型无效`);
    const candidateChoices = requestedType === "choice" ? parseChoices(checkValue.choices, conceptId) : undefined;
    const type = requestedType === "choice" && (candidateChoices?.length ?? 0) >= 2 ? "choice" : "short_text";
    const choices = type === "choice" ? candidateChoices : undefined;
    return {
        conceptId,
        evidence,
        evidenceSource,
        simplification,
        teaching,
        check: {
            prompt: requiredString(checkValue, "prompt", 5, 120),
            type,
            choices,
            answer: requiredString(checkValue, "answer", 1, 80),
            explanation: requiredString(checkValue, "explanation", 6, 100),
        },
    };
}
function validateGrounding(blueprint, sources) {
    const actualSource = validateSelectionGrounding(blueprint, sources);
    if (blueprint.evidenceSource !== actualSource)
        throw new Error(`节点 ${blueprint.conceptId} 的证据来源标注不正确`);
    const concept = (0, curriculum_1.getConcept)(blueprint.conceptId);
    const terms = concept ? [concept.title, ...concept.aliases].map(normalize) : [];
    const explanation = normalize(blueprint.teaching.explanation);
    if (!terms.some((term) => term.length >= 2 && explanation.includes(term))) {
        throw new Error(`节点 ${blueprint.conceptId} 的讲解没有说明所选课标概念`);
    }
    if (!explanation.includes(normalize(blueprint.evidence))) {
        throw new Error(`节点 ${blueprint.conceptId} 的讲解没有联系已引用的题目证据`);
    }
    const forbiddenTemplates = ["不是要背一句定义", "降低同时处理的信息量", "只保留这一件事"];
    const combined = `${blueprint.simplification}${blueprint.teaching.explanation}${blueprint.teaching.example}`;
    if (forbiddenTemplates.some((template) => combined.includes(template))) {
        throw new Error(`节点 ${blueprint.conceptId} 仍在复用通用教学模板`);
    }
}
function validateSelectionGrounding(selection, sources) {
    const evidence = normalize(selection.evidence);
    if (evidence.length < 2)
        throw new Error(`节点 ${selection.conceptId} 的题目证据过短`);
    if (GENERIC_EVIDENCE.has(evidence))
        throw new Error(`节点 ${selection.conceptId} 的题目证据过于笼统`);
    const source = sources.find((candidate) => normalize(candidate.text).includes(evidence));
    if (!source) {
        throw new Error(`节点 ${selection.conceptId} 的证据不是题干、孩子作答或父节点中的原文`);
    }
    return source.type;
}
function validateCheck(blueprint, sources, seenChecks) {
    const prompt = normalize(blueprint.check.prompt);
    if (seenChecks.has(prompt))
        throw new Error(`节点 ${blueprint.conceptId} 的检查题与已有节点重复`);
    const originalProblem = normalize(sources.find((source) => source.type === "problem")?.text ?? "");
    if (originalProblem.length >= 8 && (prompt === originalProblem || prompt.includes(originalProblem) || (prompt.length >= 8 && originalProblem.includes(prompt)) || bigramSimilarity(prompt, originalProblem) >= 0.92)) {
        throw new Error(`节点 ${blueprint.conceptId} 把原题原样当作微型检查，没有降低难度`);
    }
    const concept = (0, curriculum_1.getConcept)(blueprint.conceptId);
    const checkExplanation = normalize(blueprint.check.explanation);
    const terms = concept ? [concept.title, ...concept.aliases].map(normalize) : [];
    if (!terms.some((term) => term.length >= 2 && checkExplanation.includes(term))) {
        throw new Error(`节点 ${blueprint.conceptId} 的检查题没有说明它如何验收当前概念`);
    }
    if (blueprint.check.type === "choice") {
        const choices = blueprint.check.choices ?? [];
        if (!choices.some((choice) => normalize(choice) === normalize(blueprint.check.answer))) {
            throw new Error(`节点 ${blueprint.conceptId} 的选择题标准答案不在选项中`);
        }
    }
}
function parseChoices(raw, conceptId) {
    if (!Array.isArray(raw))
        return [];
    if (raw.length > 5)
        throw new Error(`节点 ${conceptId} 的选择题最多 5 个选项`);
    const choices = raw.map((choice) => {
        if (typeof choice !== "string" || !choice.trim())
            throw new Error(`节点 ${conceptId} 含空选项`);
        if (choice.trim().length > 60)
            throw new Error(`节点 ${conceptId} 的选项过长`);
        return choice.trim();
    });
    const unique = choices.filter((choice, index) => choices.findIndex((candidate) => normalize(candidate) === normalize(choice)) === index);
    return unique;
}
function contentSignature(blueprint) {
    return normalize(`${blueprint.teaching.explanation}|${blueprint.teaching.example}|${blueprint.teaching.parentPrompt}|${blueprint.teaching.expectedSignal}|${blueprint.teaching.misconception}`);
}
function blueprintCheckSignature(blueprint) {
    return normalize(blueprint.check.prompt);
}
function requiredString(value, key, minLength, maxLength = Number.POSITIVE_INFINITY) {
    const raw = value[key];
    if (typeof raw !== "string" || raw.trim().length < minLength)
        throw new Error(`字段 ${key} 缺失或过短`);
    if (raw.trim().length > maxLength)
        throw new Error(`字段 ${key} 过长，最多 ${maxLength} 个字符`);
    return raw.trim();
}
function asObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${label} 不是 JSON 对象`);
    return value;
}
function normalize(value) {
    return value.toLowerCase()
        .replace(/平方厘米/g, "cm2").replace(/平方米/g, "m2").replace(/立方厘米/g, "cm3").replace(/立方米/g, "m3")
        .replace(/千米|公里/g, "km").replace(/厘米/g, "cm").replace(/毫米/g, "mm").replace(/小时/g, "h").replace(/分钟/g, "min").replace(/秒/g, "s")
        .replace(/千克|公斤/g, "kg").replace(/克/g, "g").replace(/牛顿|牛/g, "n").replace(/伏特|伏/g, "v").replace(/安培|安/g, "a").replace(/欧姆/g, "ohm")
        .replace(/²/g, "2").replace(/³/g, "3").replace(/[^\p{L}\p{N}]+/gu, "");
}
function bigramSimilarity(first, second) {
    if (first.length < 2 || second.length < 2)
        return 0;
    const left = new Set(Array.from({ length: first.length - 1 }, (_, index) => first.slice(index, index + 2)));
    const right = new Set(Array.from({ length: second.length - 1 }, (_, index) => second.slice(index, index + 2)));
    const intersection = [...left].filter((fragment) => right.has(fragment)).length;
    return intersection / Math.max(left.size, right.size);
}
function assertSelectionAntichain(selections) {
    for (let left = 0; left < selections.length; left += 1) {
        for (let right = left + 1; right < selections.length; right += 1) {
            const first = selections[left].conceptId;
            const second = selections[right].conceptId;
            if ((0, curriculum_1.isCurriculumAncestor)(first, second) || (0, curriculum_1.isCurriculumAncestor)(second, first)) {
                throw new Error(`直接前置不能同时包含上下游概念：${first} / ${second}`);
            }
        }
    }
}
function requiredEvidenceSource(value) {
    if (value === "problem" || value === "child_work" || value === "parent")
        return value;
    throw new Error("节点 evidenceSource 缺失或无效");
}
const GENERIC_EVIDENCE = new Set(["多少", "题目", "不会", "求出", "已知", "结果", "计算", "接下来"]);
function uid(prefix) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
