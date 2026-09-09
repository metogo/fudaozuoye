import type { ProblemSnapshot } from "./types";

/** Older snapshots omit this field; absence never creates visual evidence. */
export function parseMissingVisualInformation(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8 || value.some(item => typeof item !== "string" || !item.trim() || item.length > 180)) {
    throw new Error("缺失图中条件的识别结果格式不合法");
  }
  return [...new Set(value.map(item => item.trim()))];
}

export function assertProblemInformationComplete(problem: Pick<ProblemSnapshot, "missingVisualInformation">): void {
  const missing = parseMissingVisualInformation(problem.missingVisualInformation);
  if (missing.length) throw new Error(`题目文字已保留，请补拍题目和配图。还缺少：${missing.join("；")}`);
}
