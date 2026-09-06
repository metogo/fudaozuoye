"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emphasisEvidence = emphasisEvidence;
exports.emphasisRanges = emphasisRanges;
exports.parseLearningEmphasis = parseLearningEmphasis;
const presentation_1 = require("./presentation");
const katex_1 = __importDefault(require("katex"));
function emphasisEvidence(source, problem) {
    return [{ id: "problem", text: problem }, ...(0, presentation_1.prepareLearningMarkdown)(source).split(/\n\s*\n/).map((text, index) => ({ id: `e${index}`, text }))]
        .filter((item) => item.text.trim().length >= 3 && !/^\s*#/.test(item.text));
}
/** Structural guard, not a proof of pedagogical correctness. */
function emphasisRanges(source, marks) {
    const content = (0, presentation_1.prepareLearningMarkdown)(source);
    const protectedRanges = [...content.matchAll(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g)].map((match) => ({ start: match.index, end: match.index + match[0].length, value: match[0], math: match[0].startsWith("$") }));
    const usedBlocks = new Set();
    let budget = Math.min(180, Math.floor(content.replace(/[\s#*$\\{}_]/g, "").length * .32));
    const accepted = [];
    for (const mark of Array.isArray(marks) ? marks.slice(0, 12) : []) {
        if (!mark || !["text", "math"].includes(mark.kind) || typeof mark.target !== "string" || typeof mark.reason !== "string")
            continue;
        const target = mark.target.trim();
        if (target.length < (mark.kind === "text" ? 4 : 2) || target.length > 180 || mark.reason.length < 8 || mark.reason.length > 180)
            continue;
        let start, end;
        if (mark.kind === "math") {
            try {
                katex_1.default.renderToString(target, { throwOnError: true, trust: false, maxExpand: 200, maxSize: 20, strict: "ignore" });
            }
            catch {
                continue;
            }
            const matches = protectedRanges.filter((range) => range.math && range.value.replace(/^\${1,2}|\${1,2}$/g, "").trim() === target);
            if (matches.length !== 1)
                continue;
            ({ start, end } = matches[0]);
        }
        else {
            if (/[\n\r$\\*_`<>]/.test(target) || /^(?:最关键的已知条件|关键线索|第一突破口|解题思路|这一步在做什么|为什么这样做)[：:]?$/.test(target))
                continue;
            start = content.indexOf(target);
            end = start + target.length;
            if (start < 0 || content.indexOf(target, end) !== -1 || protectedRanges.some((range) => start < range.end && end > range.start))
                continue;
            const line = content.slice(content.lastIndexOf("\n", start - 1) + 1, end);
            if (/^\s*#/.test(line))
                continue;
        }
        const block = content.slice(0, start).split(/\n\s*\n/).length;
        if (usedBlocks.has(block) || target.length > budget || accepted.some((range) => start < range.end && end > range.start))
            continue;
        accepted.push({ mark: { kind: mark.kind, target, reason: mark.reason }, start, end });
        usedBlocks.add(block);
        budget -= target.length;
        if (accepted.length === 3)
            break;
    }
    return accepted;
}
function parseLearningEmphasis(value, source, problem) {
    if (!value || typeof value !== "object")
        return [];
    const items = value.marks;
    if (!Array.isArray(items))
        return [];
    const evidenceIds = new Set(emphasisEvidence(source, problem).map((item) => item.id));
    const marks = items.filter((item) => item && typeof item === "object" && typeof item.confidence === "number" && item.confidence >= .9 && item.confidence <= 1 && (evidenceIds.has(item.evidenceId) || (typeof item.evidence === "string" && item.evidence.length >= 3 && item.evidence.length <= 180 && (problem.includes(item.evidence) || (0, presentation_1.prepareLearningMarkdown)(source).includes(item.evidence)))))
        .sort((a, b) => b.confidence - a.confidence);
    return emphasisRanges(source, marks).map((range) => range.mark);
}
