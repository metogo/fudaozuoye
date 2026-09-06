import { parseBoardContext } from "../board-context";
import { assertImageFile } from "../request-guards";
import type { LearningChoice, LearningTurnInput } from "../types";

export async function parseTurnRequest(request: Request, multipart: boolean): Promise<{ stateToken: string; input: LearningTurnInput; imageDataUrl?: string }> {
  if (!multipart) {
    const body = await request.json() as Record<string, unknown>;
    const input = parseTurnInput(body.input);
    if (input.type === "image_question" || (input.type === "image_answer" || input.type === "transcribe_step")) throw new Error("请先选择要发送的图片");
    return { stateToken: cleanText(body.stateToken, "学习会话不存在", 100_000), input };
  }
  const form = await request.formData();
  const inputRaw = cleanText(form.get("input"), "学习操作不合法", 5_000);
  let inputValue: unknown;
  try { inputValue = JSON.parse(inputRaw); } catch { throw new Error("学习操作不合法"); }
  const input = parseTurnInput(inputValue);
  if (input.type !== "start" && input.type !== "image_question" && input.type !== "image_answer" && input.type !== "transcribe_step") throw new Error("图片只能用于原题分析、当前提问或作答");
  const image = form.get("image");
  if (!(image instanceof File)) throw new Error("请先选择要发送的图片");
  await assertImageFile(image);
  const imageDataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
  return { stateToken: cleanText(form.get("stateToken"), "学习会话不存在", 100_000), input, imageDataUrl };
}

export function cleanText(value: unknown, emptyMessage: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(emptyMessage);
  const text = value.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (!text) throw new Error(emptyMessage);
  if (text.length > maximum) throw new Error(`内容请控制在 ${maximum} 字以内`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) throw new Error("内容中含有不支持的控制字符");
  return text;
}

function parseTurnInput(value: unknown): LearningTurnInput {
  if (!value || typeof value !== "object") throw new Error("学习操作不合法");
  const input = value as Record<string, unknown>;
  if (input.type === "start" || input.type === "retry_original" || input.type === "request_transfer") return { type: input.type };
  if (input.type === "question") return { type: "question", text: cleanText(input.text, "请输入想问的问题", 300), ...(input.quote !== undefined ? { quote: cleanText(input.quote, "请选择要提问的文字", 12000) } : {}) };
  if (input.type === "image_question") return { type: "image_question" };
  if (input.type === "choose_suggestion") return { type: "choose_suggestion", suggestionId: cleanText(input.suggestionId, "推荐问题不存在", 100) };
  if (input.type === "acknowledge_illustration") return { type: "acknowledge_illustration", gateId: cleanText(input.gateId, "学习任务不存在", 100), receipt: cleanText(input.receipt, "插画完成凭证不存在", 500) };
  if (input.type === "answer") return { type: "answer", gateId: cleanText(input.gateId, "学习任务不存在", 100), answer: cleanText(input.answer, "请先写下答案", 2_000) };
  if ((input.type === "image_answer" || input.type === "transcribe_step")) return { type: input.type, gateId: cleanText(input.gateId, "学习任务不存在", 100) };
  if (input.type === "choose" && ["view_step_answer", "continue", "try", "not_understood", "full_solution", "view_board", "view_illustration", "start_recall", "retry_original", "practice_similar", "finish_review"].includes(String(input.choice))) {
    const choice = input.choice as LearningChoice;
    if (choice !== "view_board" && choice !== "try" && input.boardContext !== undefined) throw new Error("当前操作不能携带板书上下文");
    return { type: "choose", gateId: cleanText(input.gateId, "学习任务不存在", 100), choice, ...((choice === "view_board" || choice === "try") ? { boardContext: parseBoardContext(input.boardContext) } : {}) };
  }
  throw new Error("学习操作不合法");
}
