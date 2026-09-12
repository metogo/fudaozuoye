"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tutorSystemPrompt = tutorSystemPrompt;
exports.tutorPrompt = tutorPrompt;
exports.tutorReplyMock = tutorReplyMock;
exports.questionSuggestionsPrompt = questionSuggestionsPrompt;
exports.parseQuestionSuggestions = parseQuestionSuggestions;
exports.questionSuggestionsMock = questionSuggestionsMock;
const flow_1 = require("../flow");
const math_quality_1 = require("../math-quality");
const teaching_accuracy_1 = require("./teaching-accuracy");
const grade_pedagogy_1 = require("../grade-pedagogy");
const problem_evidence_1 = require("../problem-evidence");
const guideSectionLabels = {
    goal: "这道题要解决什么",
    keyClue: "先抓住这条线索",
    approach: "解题方向",
};
function tutorSystemPrompt(learnerBand = "junior") {
    return [
        math_quality_1.mathOutputInstruction,
        teaching_accuracy_1.teachingAccuracyInstruction,
        "你是正在带学生自主完成一道具体作业题的 K12 全学科老师。",
        "只回答给定原题或当前知识节点内的问题，不扩展无关知识，不评价学生能力。",
        "直接对学生说话。先准确回应卡点，再解释“为什么”和“怎样做”；是否举例、怎样表示关系以及最后追问什么，严格按当前学段教学结构执行。",
        "简洁不等于省略：不能只返回结论、单句提示或空泛建议。通常用 2 到 4 个短段落；按内容需要使用“这一步在做什么”“为什么这样做”“看个小例子”等短标题，或用加粗、列表、引用建立层次。",
        "默认不公布最终答案或完整解题过程。即使用户索要答案，也只给当前下一步提示，并告知完整答案有单独入口。",
        "上下文含 focusSection 时，只解释该段与学生问题的关系；先明确正在回应哪一段，不得含糊地退回整道原题泛讲。",
        "不得声称学生已经掌握，不得修改学习状态。",
        "使用简洁 Markdown 组织内容：按内容需要使用短标题、加粗、列表或引用，不要输出一整块无层次纯文本，不要把每句话都做成标题，也不要使用表格、HTML 或分隔线。",
        "所有数学与物理公式必须使用 KaTeX 兼容的 LaTeX：行内公式写在 $...$ 中，独立推导写在 $$...$$ 中；不要用代码块包裹公式。化学式使用 $\\mathrm{H_2O}$ 这类标准 LaTeX。",
        (0, grade_pedagogy_1.gradeTeachingInstruction)(learnerBand, "chat"),
    ].join("\n");
}
function tutorPrompt(session, scope, question) {
    const directIds = new Set(session.edges.filter((edge) => edge.to === session.rootNodeId).map((edge) => edge.from));
    const directConcepts = session.nodes
        .filter((node) => directIds.has(node.id))
        .map((node) => ({ title: node.title, evidence: node.diagnosticEvidence, reason: node.simplification }));
    const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId) : undefined;
    if (scope.kind === "node" && (!node || node.kind !== "concept"))
        throw new Error("追问的知识节点不存在");
    const focusSection = scope.kind === "problem" && scope.section ? {
        key: scope.section,
        label: guideSectionLabels[scope.section],
        text: session.problemGuide[scope.section],
    } : undefined;
    const context = scope.kind === "problem"
        ? { scope: focusSection ? "原题引导的指定段落" : "原题引导", problem: session.problem, guide: session.problemGuide, focusSection, directConcepts }
        : {
            scope: "当前知识节点",
            problem: session.problem,
            node: {
                title: node?.title,
                evidence: node?.diagnosticEvidence,
                reason: node?.simplification,
                teaching: node?.teaching,
                checkPrompt: node?.check.prompt,
            },
        };
    const learnerBand = (0, grade_pedagogy_1.teachingBandOf)(session.problem);
    return JSON.stringify({
        context,
        parentQuestion: question,
        outputRequirements: {
            structure: "系统会在正文前显示当前讲解范围，不要重复总标题；正文使用 2 到 4 个短段落，并至少使用一个加粗的局部标签，不能输出一整块纯文本",
            teachingDepth: (0, grade_pedagogy_1.gradeTeachingInstruction)(learnerBand, "chat"),
            boundary: "只讲当前一步，不公布最终答案；结尾只问一个能让学生继续思考的问题",
        },
    });
}
function tutorReplyMock(session, scope, question) {
    if (scope.kind === "problem") {
        if (scope.section)
            return `**你问的是：** ${question}\n\n这里正在讲 **${guideSectionLabels[scope.section]}**：${session.problemGuide[scope.section]}\n\n> 先从这句话里圈出最关键的条件，再说说它和题目要求有什么关系。`;
        return `**你问的是：** ${question}\n\n${session.problemGuide.keyClue}\n\n${session.problemGuide.approach}\n\n> 接着想一想：${session.problemGuide.firstQuestion}`;
    }
    const node = session.nodes.find((item) => item.id === scope.nodeId);
    if (!node || node.kind !== "concept")
        throw new Error("追问的知识节点不存在");
    return `**你问的是：** ${question}\n\n${node.teaching.alternateExplanation}\n\n**看一个更具体的例子**\n\n${node.teaching.example}\n\n> 然后想一想：${node.teaching.parentPrompt}`;
}
function questionSuggestionsPrompt(session, scope, sourceText) {
    const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
    return JSON.stringify({
        task: "判断刚完成的讲解之后，是否存在值得学生顺手追问、但不会打断当前学习任务的问题。没有必要时返回 recommended=false。",
        problem: (0, problem_evidence_1.problemEvidenceText)(session.problem),
        currentFocus: scope.kind === "problem"
            ? { label: (0, flow_1.flowScopeLabel)(session, scope), guide: session.problemGuide }
            : { label: (0, flow_1.flowScopeLabel)(session, scope), title: node?.title, evidence: node?.diagnosticEvidence, teaching: node?.teaching.explanation },
        completedExplanation: sourceText,
        currentRequiredTask: session.flow.activeGate?.title ?? "继续当前学习",
        learnerLanguage: (0, grade_pedagogy_1.gradeTeachingInstruction)((0, grade_pedagogy_1.teachingBandOf)(session.problem), "suggestion"),
        rules: [
            "问题必须能帮助理解当前题目或当前讲解中的关系",
            "问题不能索要最终答案、完整解法或代做",
            "问题不能重复当前必做任务，也不能把建议写成命令",
            "只有确实值得问时才给 1 到 3 个简短问题，宁缺毋滥",
        ],
        output: { recommended: true, questions: ["为什么这个条件会决定第一步？", "如果少了这个条件，思路会怎样变化？"] },
    });
}
function parseQuestionSuggestions(value, session, scope, sourceText) {
    if (typeof value.recommended !== "boolean")
        throw new Error("猜你想问缺少教学判断");
    if (!value.recommended)
        return [];
    if (!Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 3)
        throw new Error("猜你想问数量不合法");
    const gateTitle = normalizeQuestion(session.flow.activeGate?.title ?? "");
    const scopeLabel = (0, flow_1.flowScopeLabel)(session, scope);
    const sourceSummary = plainSummary(sourceText);
    const seen = new Set();
    const questions = value.questions.flatMap((raw) => {
        if (typeof raw !== "string")
            throw new Error("猜你想问内容不合法");
        const text = raw.trim();
        const normalized = normalizeQuestion(text);
        if (text.length < 4 || text.length > 60 || !normalized || seen.has(normalized))
            return [];
        if (/(?:最终|标准)?答案|完整(?:解法|步骤|讲解)|直接告诉|帮我(?:做完|算完)|最后结果/.test(text))
            return [];
        if (gateTitle && (normalized === gateTitle || normalized.includes(gateTitle) || gateTitle.includes(normalized)))
            return [];
        if ((0, grade_pedagogy_1.inspectGradeLanguage)(text, (0, grade_pedagogy_1.teachingBandOf)(session.problem), session.problem.text).length)
            return [];
        seen.add(normalized);
        return [{ id: `suggest-${crypto.randomUUID().slice(0, 8)}`, text, scopeLabel, sourceSummary }];
    });
    return questions.slice(0, 3);
}
function questionSuggestionsMock(session, scope, sourceText) {
    const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
    const candidates = node
        ? [`“${node.title}”和原题里的哪个条件直接相连？`, `判断这一步是否用对，可以检查什么？`]
        : ["为什么这条条件会决定第一步？", "如果忽略这条线索，最容易错在哪里？"];
    return parseQuestionSuggestions({ recommended: true, questions: candidates }, session, scope, sourceText);
}
function plainSummary(value) {
    const text = value
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\$\$?|\*\*|__|[`>#*_~-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (text.length < 4)
        throw new Error("猜你想问缺少可引用的讲解");
    return text.slice(0, 76);
}
function normalizeQuestion(value) {
    return value.normalize("NFKC").replace(/[？?。！!，,：:\s“”‘’'\"（）()]/g, "").toLowerCase();
}
