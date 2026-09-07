"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionSegments = connectionSegments;
exports.parseKnowledgeConnection = parseKnowledgeConnection;
exports.parseGeneratedConnection = parseGeneratedConnection;
exports.latestConnectionMessage = latestConnectionMessage;
const presentation_1 = require("./presentation");
function connectionSegments(source) {
    return source.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean).map((text, i) => ({ id: `p${i + 1}`, text }));
}
/** Semantic selection is made by the model; this only checks the exact cited source. */
function parseKnowledgeConnection(value, source, evidence) {
    if (value === null)
        return null;
    const raw = record(value);
    if (raw.version !== 1 || !["prerequisite", "application"].includes(String(raw.kind)))
        throw new Error("知识连接格式不完整");
    if (typeof raw.anchor !== "string" || typeof raw.evidence !== "string")
        throw new Error("知识连接缺少引用");
    const anchor = raw.anchor.trim(), quote = raw.evidence.trim();
    if (quote.length < 2 || !connectionSegments(source).some(p => p.text === anchor) || !evidence.includes(quote))
        throw new Error("知识连接没有对应本段讲解或原题依据");
    const concept = (input) => {
        const node = record(input);
        return { title: clean(node.title, 2, 30), explanation: clean(node.explanation, 8, 400), example: clean(node.example, 0, 240) };
    };
    const foundation = concept(raw.foundation), target = concept(raw.target);
    if (foundation.title.replace(/\s/g, "") === target.title.replace(/\s/g, ""))
        throw new Error("知识连接重复了同一个概念");
    return { version: 1, anchor, evidence: quote, kind: raw.kind, foundation, target, reason: clean(raw.reason, 12, 180) };
}
function parseGeneratedConnection(value, source, evidenceSegments) {
    const raw = record(value);
    if (raw.relevant === false)
        return null;
    if (raw.relevant !== true)
        throw new Error("知识连接缺少必要性判断");
    const anchor = connectionSegments(source).find(p => p.id === raw.anchorId);
    const evidence = evidenceSegments.find(p => p.id === raw.evidenceId);
    if (!anchor || !evidence)
        throw new Error("知识连接引用了不存在的讲解或题目");
    return parseKnowledgeConnection({ ...raw, version: 1, anchor: anchor.text, evidence: evidence.text }, source, evidence.text);
}
function latestConnectionMessage(messages) {
    for (const message of [...messages].reverse()) {
        if (message.role === "user")
            return undefined;
        if (message.role !== "assistant" || message.kind !== "assistant" || message.surface === "board")
            continue;
        return message.status === "complete" && message.text.trim().length >= 30 && message.text.length <= 60000 ? message : undefined;
    }
}
function record(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("知识连接内容不完整");
    return value;
}
function clean(value, min, max) {
    if (typeof value !== "string" || value.trim().length < min || value.length > max)
        throw new Error("知识连接文字不完整或过长");
    (0, presentation_1.assertBalancedLearningMarkup)(value, "知识连接");
    return value.trim();
}
