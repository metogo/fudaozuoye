/** Detect lost TeX escapes, never infer a missing mathematical expression. */
export function hasDamagedFormula(source: string): boolean {
  const prose = source.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/g, "");
  return /[\u0008\u000c]|\root\s*\{|\text\s*\{|(?<![A-Za-z\\])(?:rac|oot)\s*\{/.test(prose);
}

export const damagedProblemFormulaMessage = "原题保存的公式已损坏，请返回对话核对原图并重新识别；重试图谱无法修复原题。";

export function assertFormulaIntegrity(source: string, message = "知识内容的公式已损坏，请重新生成") {
  if (hasDamagedFormula(source)) throw new Error(message);
}
