"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.damagedProblemFormulaMessage = void 0;
exports.hasDamagedFormula = hasDamagedFormula;
exports.assertFormulaIntegrity = assertFormulaIntegrity;
/** Detect lost TeX escapes, never infer a missing mathematical expression. */
function hasDamagedFormula(source) {
    const prose = source.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/g, "");
    return /[\u0008\u000c]|\root\s*\{|\text\s*\{|(?<![A-Za-z\\])(?:rac|oot)\s*\{/.test(prose);
}
exports.damagedProblemFormulaMessage = "原题保存的公式已损坏，请返回对话核对原图并重新识别；重试图谱无法修复原题。";
function assertFormulaIntegrity(source, message = "知识内容的公式已损坏，请重新生成") {
    if (hasDamagedFormula(source))
        throw new Error(message);
}
