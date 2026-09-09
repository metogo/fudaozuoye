"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProblemVisualContext = parseProblemVisualContext;
exports.problemEvidenceText = problemEvidenceText;
exports.visualEvidenceTexts = visualEvidenceTexts;
exports.requiresProblemImage = requiresProblemImage;
exports.needsVisualReview = needsVisualReview;
const factSources = new Set(["printed_label", "visual_relation"]);
function parseProblemVisualContext(value) {
    if (value === undefined || value === null)
        return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("题图理解信息不合法");
    const item = value;
    if (typeof item.related !== "boolean" || typeof item.affectsSolving !== "boolean")
        throw new Error("题图相关性判断不完整");
    const confidence = boundedConfidence(item.confidence, "题图相关性置信度不合法");
    if (!item.related)
        return { related: false, affectsSolving: false, summary: "", facts: [], confidence };
    if (typeof item.summary !== "string" || item.summary.trim().length < 2 || item.summary.length > 600)
        throw new Error("题图摘要不完整");
    if (!Array.isArray(item.facts) || item.facts.length > 16)
        throw new Error("题图事实数量不合法");
    const facts = item.facts.map(parseVisualFact);
    if (item.affectsSolving && facts.length === 0)
        throw new Error("题图影响求解，但没有识别出可核验条件");
    const summary = facts.length ? facts.map((fact) => fact.text).join("；") : "与当前题目相关的辅助图片";
    return { related: true, affectsSolving: item.affectsSolving, summary, facts, confidence };
}
function problemEvidenceText(problem) {
    const visual = problem.visualContext;
    if (!visual?.related || !visual.affectsSolving)
        return problem.text;
    const facts = visual.facts.map((fact) => `- ${fact.text}`).join("\n");
    return `${problem.text}\n\n【题图证据】\n${facts}`;
}
function visualEvidenceTexts(problem) {
    return problem.visualContext?.related && problem.visualContext.affectsSolving ? problem.visualContext.facts.map((fact) => fact.text) : [];
}
function requiresProblemImage(problem) {
    return problem.visualContext?.related === true;
}
function needsVisualReview(problem) {
    if (problem.missingVisualInformation?.length)
        return true;
    const visual = problem.visualContext;
    return Boolean(visual?.related && visual.affectsSolving && (visual.confidence < 0.82 || visual.facts.some((fact) => fact.confidence < 0.82)));
}
function parseVisualFact(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("题图事实结构不合法");
    const item = value;
    if (typeof item.text !== "string" || item.text.trim().length < 2 || item.text.length > 180)
        throw new Error("题图事实内容不合法");
    if (!factSources.has(item.source))
        throw new Error("题图事实来源不合法");
    return { text: item.text.trim(), source: item.source, confidence: boundedConfidence(item.confidence, "题图事实置信度不合法") };
}
function boundedConfidence(value, message) {
    const confidence = typeof value === "number" ? value : Number.NaN;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
        throw new Error(message);
    return confidence;
}
