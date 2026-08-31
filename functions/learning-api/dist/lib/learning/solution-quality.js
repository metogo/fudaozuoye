"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertDetailedSolution = assertDetailedSolution;
exports.isDetailedSolution = isDetailedSolution;
exports.inspectDetailedSolution = inspectDetailedSolution;
exports.describeDetailedSolutionIssues = describeDetailedSolutionIssues;
const SECTION_HEADINGS = [
    ["解题思路", "思路分析", "方法选择", "解法分析", "分析思路"],
    ["分步推导", "解题步骤", "推导过程", "详细步骤", "解答过程", "计算过程", "证明过程"],
    ["结论", "最终答案", "最后结果", "答案与结论", "结果与结论"],
    ["易错提醒", "易错点", "注意事项", "检查与提醒", "验算与提醒", "自检提醒"],
];
const ISSUE_LABELS = {
    too_short: "讲解篇幅不足",
    missing_approach: "缺少解题思路",
    missing_derivation: "缺少分步推导",
    missing_conclusion: "缺少明确结论",
    missing_pitfall: "缺少易错提醒",
    section_order: "讲解结构顺序混乱",
    insufficient_steps: "可跟随的推导步骤不足两步",
    missing_sub_questions: "没有逐项覆盖全部小问",
};
function assertDetailedSolution(solution, problemText) {
    const inspection = inspectDetailedSolution(solution, problemText);
    if (!inspection.valid)
        throw new Error(`完整讲解未通过内容验收：${describeDetailedSolutionIssues(inspection)}`);
}
function isDetailedSolution(solution, problemText) {
    return inspectDetailedSolution(solution, problemText).valid;
}
function inspectDetailedSolution(solution, problemText) {
    const text = solution.trim();
    const issues = [];
    if ([...text].length < 180)
        issues.push("too_short");
    const positions = SECTION_HEADINGS.map((headings) => headingPosition(text, headings));
    if (positions[0] < 0)
        issues.push("missing_approach");
    if (positions[1] < 0)
        issues.push("missing_derivation");
    if (positions[2] < 0)
        issues.push("missing_conclusion");
    if (positions[3] < 0)
        issues.push("missing_pitfall");
    if (positions.every((position) => position >= 0) && positions.some((position, index) => index > 0 && position <= positions[index - 1]))
        issues.push("section_order");
    if (countReasoningSteps(text) < 2)
        issues.push("insufficient_steps");
    const missingSubQuestions = extractSubQuestionIndexes(problemText).filter((index) => !mentionsSubQuestion(text, index));
    if (missingSubQuestions.length)
        issues.push("missing_sub_questions");
    return { valid: issues.length === 0, issues, missingSubQuestions };
}
function describeDetailedSolutionIssues(inspection) {
    return inspection.issues.map((issue) => issue === "missing_sub_questions"
        ? `${ISSUE_LABELS[issue]}（第 ${inspection.missingSubQuestions.join("、")} 问）`
        : ISSUE_LABELS[issue]).join("；");
}
function headingPosition(text, candidates) {
    const alternatives = candidates.map(escapeRegex).join("|");
    const pattern = new RegExp(`^\\s*(?:#{1,6}\\s*)?(?:[一二三四五六七八九十]+[、.]\\s*)?(?:\\*\\*|__)?(?:${alternatives})(?:\\*\\*|__)?\\s*(?:[：:].*)?$`, "gmu");
    return pattern.exec(text)?.index ?? -1;
}
function countReasoningSteps(text) {
    const pattern = /^\s*(?:#{1,6}\s*)?(?:(?:\d+[.、)]|[（(]\d+[）)]|第\s*[一二三四五六七八九十\d]+\s*步|步骤\s*[一二三四五六七八九十\d]+)\s*)/gmu;
    return text.match(pattern)?.length ?? 0;
}
function extractSubQuestionIndexes(problemText) {
    const indexes = [...problemText.matchAll(/(?:^|[\n；;。])\s*(?:第\s*)?[（(]?([1-9])[）).、](?:\s*问)?/g)].map((match) => match[1]);
    return [...new Set(indexes)];
}
function mentionsSubQuestion(solution, index) {
    const chineseIndex = SUB_QUESTION_CHINESE_INDEX[index] ?? "";
    const indexLabel = chineseIndex ? `(?:${index}|${chineseIndex})` : index;
    const markdownPrefix = "(?:#{1,6}\\s*)?(?:(?:\\*\\*|__|\\*|_)\\s*)?";
    return new RegExp(`(?:^|\\n)\\s*${markdownPrefix}(?:第\\s*${indexLabel}\\s*问|问题\\s*${index}|[（(]\\s*${index}\\s*[）)])`, "mu").test(solution);
}
const SUB_QUESTION_CHINESE_INDEX = {
    "1": "一",
    "2": "二",
    "3": "三",
    "4": "四",
    "5": "五",
    "6": "六",
    "7": "七",
    "8": "八",
    "9": "九",
};
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
