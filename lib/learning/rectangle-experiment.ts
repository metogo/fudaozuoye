import type { ProblemSnapshot } from "./types";

/** A closed teaching model, not an AI reconstruction of the question's diagram. */
export type Rectangle = { length: number; width: number };
export const experimentStart: Rectangle = { length: 4, width: 2 };
// 留出实验事实和边界说明的空间，完整追问须满足现有接口的 300 字限制。
export const experimentObservationLimit = 100;

/** Deliberately narrow: compound shapes, missing diagrams and inferred dimensions do not qualify. */
export function supportsRectangleExperiment(problem: ProblemSnapshot): boolean {
  const text = problem.text.trim();
  if (problem.subject !== "math" || !Number.isFinite(problem.confidence) || problem.confidence < .85
    || problem.missingVisualInformation?.length || problem.visualContext?.affectsSolving || text.length > 300) return false;
  if (!/长方形|\brectangle\b/i.test(text) || !/周长|面积|\bperimeter\b|\barea\b/i.test(text)) return false;
  if (/不是|并非|两个|两块|多个|若干|拼|剪|切|阴影|梯形|三角|正方形|圆|折|旋转|围成|比|增加|减少|扩大|缩小|倍|长方体|立方|not a|shaded|triangle|square|circle|cut|two rectangles/i.test(text)) return false;
  const length = [...text.matchAll(/(?:长(?:度)?(?:是|为)?\s*[:：=]?|\blength\s*(?:is|of|=)?)\s*(\d+(?:\.\d+)?)\s*(厘米|米|cm\b|m\b)/gi)];
  const width = [...text.matchAll(/(?:宽(?:度)?(?:是|为)?\s*[:：=]?|\bwidth\s*(?:is|of|=)?)\s*(\d+(?:\.\d+)?)\s*(厘米|米|cm\b|m\b)/gi)];
  if (length.length !== 1 || width.length !== 1) return false;
  const unit = (value: string) => /^(厘米|cm)$/i.test(value) ? "cm" : "m";
  return unit(length[0][2]) === unit(width[0][2]) && Number(width[0][1]) > 0
    && Number(length[0][1]) >= Number(width[0][1]) && Number(length[0][1]) <= 10000;
}

export function rectangleMetrics(rectangle: Rectangle) {
  const { length, width } = rectangle;
  if (![length, width].every(n => Number.isInteger(n) && n >= 1 && n <= 8) || width > length) throw new Error("实验尺寸不合法");
  return { perimeter: 2 * (length + width), area: length * width };
}

export function resizeRectangle(current: Rectangle, side: keyof Rectangle, value: number, fixedSum: number | null): Rectangle {
  rectangleMetrics(current);
  if (!Number.isInteger(value)) throw new Error("实验尺寸必须为整数");
  if (fixedSum !== null) {
    if (fixedSum !== current.length + current.width) throw new Error("固定周长约束不一致");
    const requestedLength = side === "length" ? value : fixedSum - value;
    const length = Math.max(Math.ceil(fixedSum / 2), Math.min(Math.min(8, fixedSum - 1), requestedLength));
    return { length, width: fixedSum - length };
  }
  return side === "length" ? { length: Math.max(current.width, Math.min(8, value)), width: current.width }
    : { length: current.length, width: Math.max(1, Math.min(current.length, value)) };
}

/** Handoff is a question, never an answer or evidence of mastery. UI language does not change tutor language. */
export function experimentQuestion(before: Rectangle, after: Rectangle, fixedSum: number | null, question: string): string {
  if (question.length > experimentObservationLimit) throw new Error("实验观察最多 100 字");
  const a = rectangleMetrics(before), b = rectangleMetrics(after);
  if (fixedSum !== null && (before.length + before.width !== fixedSum || after.length + after.width !== fixedSum)) throw new Error("实验对比不满足固定周长");
  return `我刚做了一个独立的长方形知识小实验（不是原题配图，以下数值不是原题条件）：${fixedSum === null ? "自由改变边长" : `固定周长为${fixedSum * 2}厘米`}，从长${before.length}厘米、宽${before.width}厘米，变到长${after.length}厘米、宽${after.width}厘米；周长从${a.perimeter}厘米变为${b.perimeter}厘米，面积从${a.area}平方厘米变为${b.area}平方厘米。\n\n${question.trim() || "这个变化为什么会发生？它和原题用到的知识有什么联系？"}请联系原题解释，不要把实验数值替换到原题中。`;
}
