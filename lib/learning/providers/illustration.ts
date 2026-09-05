import type { IllustrationFrame, IllustrationLesson, LearningSession } from "../types";
import { illustrationFingerprint } from "../illustration-fingerprint";
import type { JsonObject } from "./model-support";

export interface IllustrationStoryboardFrame {
  id: string;
  title: string;
  calculationEvidence: string;
  transition: string;
  visualPrompt: string;
  alt: string;
}

export interface IllustrationStoryboard {
  title: string;
  frames: IllustrationStoryboardFrame[];
}

export { illustrationFingerprint } from "../illustration-fingerprint";

export function illustrationSolutionEvidence(session: LearningSession): string {
  const root = session.nodes.find((node) => node.id === session.rootNodeId);
  if (!root || !root.check.answer.trim() || !root.check.explanation.trim()) throw new Error("原题解答尚未核验，暂时不能生成插画");
  return `${root.check.explanation.trim()}\n结论：${root.check.answer.trim()}`;
}

export function illustrationStoryboardPrompt(session: LearningSession, solutionEvidence: string): { system: string; prompt: string } {
  return {
    system: [
      "你是 K12 分步演算插画导演。只输出严格 JSON，不输出 Markdown。",
      "根据真实有效演算步骤自由决定最合适的 2 到 6 帧；不能为凑数量拆分、复述或增加无教学作用的帧。",
      "每帧 calculationEvidence 必须是单个字符串，逐字复制下方已核验解答中的一段；短公式可以原样保留，不能改写、补算或发明数值。",
      "visualPrompt 只描述无文字、无公式、无数字标注的具象场景；数学文字由网页另行显示。",
      "相邻帧必须保持对象、颜色、视角和场景一致，transition 说明这一步如何承接上一帧。",
    ].join("\n"),
    prompt: JSON.stringify({
      problem: session.problem.text,
      confirmedVisualFacts: session.problem.visualContext?.facts.map((fact) => fact.text) ?? [],
      verifiedSolution: solutionEvidence,
      output: {
        title: "string",
        frames: [{ id: "frame-1", title: "string", calculationEvidence: "已核验解答中的逐字片段", transition: "与上一帧的关系；第一帧写从原题条件开始", visualPrompt: "无文字无数字的画面描述", alt: "不依赖图片也能理解的替代文本" }],
      },
    }),
  };
}

export function parseIllustrationStoryboard(value: JsonObject, solutionEvidence: string): IllustrationStoryboard {
  const title = boundedText(value.title, "插画标题", 4, 80);
  if (!Array.isArray(value.frames) || value.frames.length < 2 || value.frames.length > 6) throw new Error("插画分镜必须包含 2 到 6 个有效步骤");
  const ids = new Set<string>();
  const prompts = new Set<string>();
  const evidenceSignatures = new Set<string>();
  const frames = value.frames.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("插画分镜结构不合法");
    const item = raw as JsonObject;
    const id = boundedText(item.id, "分镜标识", 3, 32);
    if (!/^frame-[1-6]$/.test(id) || ids.has(id)) throw new Error("插画分镜标识不合法或重复");
    const calculationEvidence = boundedEvidence(item.calculationEvidence);
    const evidenceSignature = normalizedEvidence(calculationEvidence);
    if (!containsGroundedEvidence(solutionEvidence, calculationEvidence)) throw new Error("插画演算文字没有逐字来自已核验解答");
    if (evidenceSignatures.has(evidenceSignature)) throw new Error("插画演算依据不能重复或用于凑帧");
    const visualPrompt = boundedText(item.visualPrompt, "画面描述", 12, 800);
    const promptSignature = visualPrompt.replace(/\s/g, "").toLowerCase();
    if (prompts.has(promptSignature)) throw new Error("插画分镜不能重复画面");
    if (/(https?:\/\/|data:|<\/?[a-z]|[0-9０-９A-Za-z=+×÷*/^<>]|文字|公式|数字|算式|标签|标注)/i.test(visualPrompt)) throw new Error("插画画面描述包含不允许的内容");
    ids.add(id);
    prompts.add(promptSignature);
    evidenceSignatures.add(evidenceSignature);
    return {
      id,
      title: boundedText(item.title, "分镜标题", 2, 60),
      calculationEvidence,
      transition: boundedText(item.transition, "承接关系", 4, 160),
      visualPrompt,
      alt: boundedText(item.alt, "替代文本", 8, 240),
    };
  });
  if (frames.some((frame, index) => frame.id !== `frame-${index + 1}`)) throw new Error("插画分镜顺序不连续");
  return { title, frames };
}

export function imageGenerationPrompt(storyboard: IllustrationStoryboard): string {
  return [
    "生成一组连续的 K12 教学插画，温暖清晰的扁平绘本风格，横向 4:3 构图。",
    `共 ${storyboard.frames.length} 幅，严格按顺序输出。全组保持相同对象、配色、比例、视角和场景。`,
    "画面中禁止出现任何文字、字母、公式、算式、答案、水印或数字标注。只画具象关系，不把数学文字画进图片。",
    ...storyboard.frames.map((frame, index) => `第 ${index + 1} 幅：${frame.visualPrompt}`),
  ].join("\n");
}

export function parseGeneratedImages(value: unknown, expected: number): Array<string | null> {
  if (!value || typeof value !== "object") throw new Error("图片模型没有返回有效结果");
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) throw new Error("图片模型没有返回有效结果");
  const urls = data.slice(0, expected).map((item) => {
    if (!item || typeof item !== "object") return null;
    const raw = (item as { url?: unknown; b64_json?: unknown }).url;
    if (typeof raw !== "string") return null;
    try {
      const url = new URL(raw);
      return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password ? url.toString() : null;
    } catch { return null; }
  });
  while (urls.length < expected) urls.push(null);
  return urls;
}

export function assembleIllustrationLesson(session: LearningSession, storyboard: IllustrationStoryboard, images: Array<string | null>): IllustrationLesson {
  const validCount = images.filter((item): item is string => Boolean(item)).length;
  if (images.length !== storyboard.frames.length || validCount !== storyboard.frames.length) throw new Error(`图片生成未完整完成（${validCount}/${storyboard.frames.length}），学习进度未改变`);
  const frames: IllustrationFrame[] = storyboard.frames.map((frame, index) => ({
    id: frame.id,
    index: index + 1,
    title: frame.title,
    calculation: frame.calculationEvidence,
    transition: frame.transition,
    alt: frame.alt,
    imageUrl: images[index]!,
  }));
  return { version: 1, requestId: session.requestId, problemFingerprint: illustrationFingerprint(session), title: storyboard.title, frameCount: frames.length, frames };
}

export function createMockIllustrationLesson(session: LearningSession): IllustrationLesson {
  const evidence = illustrationSolutionEvidence(session);
  const snippets = evidence.split(/(?<=[。；\n])/).map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 3);
  while (snippets.length < 2) snippets.push(evidence.trim());
  const storyboard: IllustrationStoryboard = {
    title: "把原题一步一步画出来",
    frames: snippets.map((calculationEvidence, index) => ({
      id: `frame-${index + 1}`,
      title: index === 0 ? "找出已知关系" : index === snippets.length - 1 ? "完成并检查" : "推进关键一步",
      calculationEvidence,
      transition: index === 0 ? "从原题给出的条件开始" : "沿用上一幅中的同一组对象，继续下一步",
      visualPrompt: index === 0 ? "同一教学场景从原题条件开始呈现物体关系" : index === snippets.length - 1 ? "同一教学场景保持对象一致并呈现完成后的物体关系" : "同一教学场景保持对象一致并呈现中间变化",
      alt: `第 ${index + 1} 步插画：${calculationEvidence}`,
    })),
  };
  const images = storyboard.frames.map((_, index) => mockSvgDataUrl(index + 1, storyboard.frames.length));
  return assembleIllustrationLesson(session, storyboard, images);
}

function boundedText(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label}不合法`);
  const text = value.normalize("NFC").trim();
  if (text.length < minimum || text.length > maximum || /[\u0000-\u001f]/.test(text)) throw new Error(`${label}不合法`);
  return text;
}

function boundedEvidence(value: unknown): string {
  if (typeof value !== "string") throw new Error("演算依据不合法：必须是单个字符串");
  if (value.length > 500) throw new Error("演算依据不合法");
  const text = value.normalize("NFC").trim();
  if (text.length < 2 || text.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error("演算依据不合法");
  const normalized = normalizedEvidence(text);
  const generic = /^(所以|因此|可知|得到|计算|答案|结论)[：:。.]?$/;
  const operand = "[\\p{L}\\p{N}（）()小数分数百分数周长面积速度时间路程宽长量]+";
  const shortFormula = new RegExp(`^(?:${operand}(?:[=+＋−－\\-×÷*/^≤≥≈≠]${operand})+|${operand}(?:%|％|²|³))$`, "u").test(normalized);
  const shortAction = /^(?:(?:求|算)(?:出)?|计算|代入|比较|检验|检查|相加|相减|相乘|相除|加上|减去|乘以|除以)(?!答案|一下).+$/u.test(normalized) && normalized.length >= 3;
  if (generic.test(normalized) || (normalized.length < 6 && !shortFormula && !shortAction)) throw new Error("演算依据过短，不能表达有效步骤");
  return text;
}

function normalizedEvidence(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, "");
}

function containsGroundedEvidence(source: string, evidence: string): boolean {
  const haystack = normalizedEvidence(source);
  const needle = normalizedEvidence(evidence);
  let offset = haystack.indexOf(needle);
  while (offset >= 0) {
    const before = haystack[offset - 1] ?? "";
    const after = haystack[offset + needle.length] ?? "";
    const startsWithDigit = /^[0-9０-９]/.test(needle);
    const endsWithDigit = /[0-9０-９]$/.test(needle);
    if ((!startsWithDigit || !/[0-9０-９]/.test(before)) && (!endsWithDigit || !/[0-9０-９]/.test(after))) return true;
    offset = haystack.indexOf(needle, offset + 1);
  }
  return false;
}

function mockSvgDataUrl(index: number, total: number): string {
  const x = 90 + index * 55;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#f5efe3"/><circle cx="${x}" cy="280" r="70" fill="#f59e0b"/><rect x="${x + 80}" y="220" width="220" height="120" rx="28" fill="#0f766e"/><path d="M120 440 H680" stroke="#78716c" stroke-width="12" stroke-linecap="round"/><circle cx="400" cy="440" r="14" fill="#292524"/><metadata>${index}/${total}</metadata></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
