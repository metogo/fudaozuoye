"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferBoardSubject = inferBoardSubject;
exports.createNativeBoardFallbackPlan = createNativeBoardFallbackPlan;
exports.createNativeBoardBlocks = createNativeBoardBlocks;
exports.createNativeBoardTitle = createNativeBoardTitle;
exports.nativeMoveWhy = nativeMoveWhy;
const board_subject_engine_1 = require("./board-subject-engine");
const presentation_1 = require("./presentation");
const board_evidence_1 = require("./board-evidence");
const answer_protection_1 = require("./providers/answer-protection");
const problem_evidence_1 = require("./problem-evidence");
function inferBoardSubject(session) {
    if (session.problem.subject === "math")
        return "math";
    if (session.problem.subject === "chinese" || session.problem.subject === "english")
        return "language";
    if (session.problem.subject === "history" || session.problem.subject === "politics")
        return "humanities";
    return "science";
}
function createNativeBoardFallbackPlan(session, blocks) {
    const profile = (0, board_subject_engine_1.subjectBoardProfileFor)(session);
    const evidence = boardEvidenceCandidates(session);
    const scenes = blocks.map((block, index) => {
        const move = profile.moves.find((candidate) => candidate.label === block.label) ?? profile.moves[index] ?? profile.moves.at(-1);
        return {
            id: block.id,
            intent: intentForRole(move.role),
            role: move.role,
            move: move.id,
            title: block.label,
            content: block.content,
            tone: block.tone,
            purpose: move.purpose,
            evidence: matchingEvidence(block.content, evidence, index),
            why: nativeMoveWhy(move.label, move.role),
            selfCheck: move.selfCheck,
            sourceMessageIds: [],
            visual: null,
        };
    });
    return {
        version: 2,
        contentRevision: 2,
        subject: inferBoardSubject(session),
        discipline: session.problem.subject,
        thesis: profile.thesis,
        learningGoal: scenes.map((scene) => scene.purpose).filter(Boolean).join("，"),
        sourceMessageIds: [],
        scenes,
    };
}
function intentForRole(role) {
    if (role === "orient")
        return "extract";
    if (role === "model")
        return "connect";
    if (role === "reason")
        return "derive";
    if (role === "misconception")
        return "compare";
    return "verify";
}
function matchingEvidence(content, evidence, index) {
    const matches = evidence.filter((candidate) => content.includes(candidate));
    return matches[index % matches.length] ?? evidence[index % evidence.length];
}
function createNativeBoardBlocks(session, scope) {
    return (0, board_subject_engine_1.createSubjectNativeBlocks)(session, scope);
}
function createNativeBoardTitle(session, scope) {
    const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
    const answer = session.nodes.find((item) => item.id === session.rootNodeId)?.check.answer ?? "";
    return node?.title && !(0, answer_protection_1.generatedTextContainsAnswer)(node.title, answer) ? node.title : (0, board_subject_engine_1.subjectBoardProfileFor)(session).label;
}
function boardEvidenceCandidates(session) {
    const values = [(0, problem_evidence_1.problemEvidenceText)(session.problem), ...session.nodes.flatMap((node) => node.kind === "concept" && node.diagnosticEvidence ? [node.diagnosticEvidence] : [])]
        .flatMap(board_evidence_1.extractBoardEvidenceClauses).map((value) => value.trim().replace(/\s+/g, " ")).filter((value) => value.length >= 4);
    const unique = Array.from(new Set(values)).map((value) => safeSlice(value, 120));
    return unique;
}
function nativeMoveWhy(label, role) {
    if (role === "orient")
        return `先完成“${label}”，后续判断才不会连接到错误对象或错误范围。`;
    if (role === "model")
        return `“${label}”把题目中的证据组织成可检查结构，避免只凭关键词或印象下结论。`;
    if (role === "reason")
        return `展开“${label}”能暴露中间依据，判断当前推理是否真的由题目条件支持。`;
    if (role === "misconception")
        return `用“${label}”检查适用条件和证据边界，可以阻止正确术语被用在错误对象上。`;
    if (role === "transfer")
        return `“${label}”保留的是判断顺序，而不是这道题的表面词句，因此能用于新的材料。`;
    return `“${label}”把关系重新解释回题目情境，用来检查是否真正理解而非只记住页面。`;
}
function safeSlice(value, maximum) {
    if (value.length <= maximum)
        return balancedOrPlain(value);
    for (let end = maximum; end >= Math.min(12, maximum); end -= 1) {
        const candidate = value.slice(0, end).replace(/[，、：；\s]+$/, "");
        if (isBalanced(candidate))
            return candidate;
    }
    return value.replace(/[$`\\]/g, "").slice(0, maximum).trim();
}
function balancedOrPlain(value) { return isBalanced(value) ? value : value.replace(/[$`\\]/g, ""); }
function isBalanced(value) { try {
    (0, presentation_1.assertBalancedLearningMarkup)(value, "安全板书文本");
    return true;
}
catch {
    return false;
} }
