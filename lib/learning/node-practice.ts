import { assertBalancedLearningMarkup } from "./presentation";
import { hasDamagedFormula } from "./formula-integrity";

export interface NodePractice {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  connection: string;
}

export function parseNodePractice(value: unknown): NodePractice {
  if (!value || typeof value !== "object") throw new Error("练习内容不完整");
  const item = value as Record<string, unknown>;
  const text = (raw: unknown, max: number) => {
    if (typeof raw !== "string" || !raw.trim() || raw.length > max || hasDamagedFormula(raw)) throw new Error("练习文本或公式不完整");
    assertBalancedLearningMarkup(raw, "练习");
    return raw.trim();
  };
  if (!Array.isArray(item.options) || item.options.length !== 3) throw new Error("练习需要三个选项");
  const options = item.options.map(option => text(option, 240));
  if (new Set(options.map(option => option.replace(/\s/g, ""))).size !== 3) throw new Error("练习选项重复");
  if (!Number.isInteger(item.correctIndex) || Number(item.correctIndex) < 0 || Number(item.correctIndex) > 2) throw new Error("练习答案无效");
  return { question: text(item.question, 600), options, correctIndex: Number(item.correctIndex), explanation: text(item.explanation, 800), connection: text(item.connection, 300) };
}
