"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNodePractice = parseNodePractice;
const presentation_1 = require("./presentation");
const formula_integrity_1 = require("./formula-integrity");
function parseNodePractice(value) {
    if (!value || typeof value !== "object")
        throw new Error("练习内容不完整");
    const item = value;
    const text = (raw, max) => {
        if (typeof raw !== "string" || !raw.trim() || raw.length > max || (0, formula_integrity_1.hasDamagedFormula)(raw))
            throw new Error("练习文本或公式不完整");
        (0, presentation_1.assertBalancedLearningMarkup)(raw, "练习");
        return raw.trim();
    };
    if (!Array.isArray(item.options) || item.options.length !== 3)
        throw new Error("练习需要三个选项");
    const options = item.options.map(option => text(option, 240));
    if (new Set(options.map(option => option.replace(/\s/g, ""))).size !== 3)
        throw new Error("练习选项重复");
    if (!Number.isInteger(item.correctIndex) || Number(item.correctIndex) < 0 || Number(item.correctIndex) > 2)
        throw new Error("练习答案无效");
    return { question: text(item.question, 600), options, correctIndex: Number(item.correctIndex), explanation: text(item.explanation, 800), connection: text(item.connection, 300) };
}
