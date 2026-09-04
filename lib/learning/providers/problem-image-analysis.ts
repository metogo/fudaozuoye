import { parseProblemVisualContext } from "../problem-evidence";
import type { ProblemSnapshot, ProblemVisualContext } from "../types";
import type { JsonObject } from "./model-support";
import { parseProblemSolution } from "./provider-validation";

const solutionSystem = [
  "你是中国 K12 九学科原题求解器。只处理当前原题，不生成知识卡、板书、首讲或迁移题。输出严格 JSON。",
  "originalAnswer 与 originalExplanation 是服务端保存的核验依据，必须准确、完整、可复核。",
  "如果题目要求说明理由、解释原因或写出依据，originalAnswer 必须同时包含结论和不可缺少的理由，不能只写结论。",
  "解题依据出现数学或物理公式时，必须使用 KaTeX 兼容的 LaTeX：行内写成 $...$，独立公式写成 $$...$$。所有字段不得包含 HTML。",
].join("\n");

export function problemRecognitionPrompt(): [string, string] {
  return [
    "你是严格的 K12 作业照片门禁与多模态识别器。先从整张照片中锁定一道完整题目，再判断照片里的图形、表格、示意、标注或其他视觉内容是否属于这道题、是否影响理解或求解。判断必须结合版面归属、题干指代和视觉语义，不能只找‘如图’关键词。邻题配图、页眉、二维码、装饰和背景不得进入当前题目。只识别题目、视觉证据及学生已有作答，不求解，不补全看不见的条件。输出严格 JSON。",
    "请判断九学科之一及学段；没有足够依据时降低 confidence。输出 recognized、failureReason、text、childWork、subject、gradeBand、confidence，以及 visualContext：{related:boolean, affectsSolving:boolean, summary:string, confidence:0到1, facts:[{text:string, source:printed_label|visual_relation, confidence:0到1}]}。facts 只写图片可直接核验的题设标签、数值、对象和空间/结构关系；每个尺寸、刻度或符号必须明确说明标注线/箭头的起点与终点或它对应的具体对象，不能把局部跨度改写成整体长宽，也不能把跨多个区域的标注直接叫作某个图形的边长。端点看不清就降低该 fact 的 confidence。不得写计算结果、推导结论、手写答案或二维码内容。不相关时 related=false、affectsSolving=false、summary为空、facts为空。",
  ];
}

export function problemSolutionRequest(problem: ProblemSnapshot, auditImage: boolean): { system: string; prompt: string } {
  let system = auditImage
    ? `${solutionSystem}\n当前附图已经被识别为属于本题。必须联合题干和原图核验所有条件后再作答，并重新输出 visualContext。visualContext 只保留解题确实会用到的可见条件，排除邻题、二维码、装饰、手写答案和无关位置描述。对尺寸、刻度或符号，必须先核对标注线/箭头的真实起点和终点，再描述它覆盖的区间；禁止把局部跨度改写成整体长宽，或把跨多个区域的跨度改写成单个图形边长。originalExplanation 必须使用这些端点关系完成推导，不能只因数值碰巧得到结果。端点不清时必须降低对应置信度。`
    : solutionSystem;
  if (auditImage && problem.userRevised) system += "\n用户已经人工确认或修正题干与 visualContext；解题必须以这些确认内容为准，不得用图片重识别静默覆盖。输出的 visualContext.facts 必须逐条原样保留用户确认的 facts，并把这些事实及 visualContext.confidence 设为 1；originalAnswer 与 originalExplanation 不得与它们冲突。";
  const prompt = JSON.stringify({
    task: "完整求解原题，只返回后续验题必需的标准答案和可复核解题依据",
    problem,
    output: {
      originalAnswer: "标准答案",
      originalExplanation: "足以复核答案的完整解题依据",
      ...(auditImage ? { visualContext: "重新对照原图，只保留当前题目解题所需且能直接核验的视觉条件；结构与输入 visualContext 相同" } : {}),
    },
  });
  return { system, prompt };
}

export function parseAuditedProblemSolution(value: JsonObject, requireModelConfidence = true, expectedAffectsSolving = false): { solution: ReturnType<typeof parseProblemSolution>; visualContext: ProblemVisualContext } {
  const visualContext = parseProblemVisualContext(value.visualContext);
  if (!visualContext) throw new Error("多模态分析缺少题图复核结果");
  if (expectedAffectsSolving && (!visualContext.related || !visualContext.affectsSolving || visualContext.facts.length === 0)) throw new Error("多模态复核丢失了当前题目必需的题图条件");
  if (requireModelConfidence && visualContext.related && visualContext.affectsSolving && (visualContext.confidence < 0.82 || visualContext.facts.some((fact) => fact.confidence < 0.82))) throw new Error("题图中的关键条件仍不清楚，请确认图中信息或重新拍摄");
  return { solution: parseProblemSolution(value), visualContext };
}

export function assertConfirmedVisualFactsPreserved(problem: ProblemSnapshot, audited: ProblemVisualContext): void {
  if (!problem.userRevised || !problem.visualContext?.related) return;
  const confirmedFacts = new Set(problem.visualContext.facts.map((fact) => compactFact(fact.text)));
  const auditedFacts = new Set(audited.facts.map((fact) => compactFact(fact.text)));
  const sameFacts = confirmedFacts.size === auditedFacts.size && [...confirmedFacts].every((fact) => auditedFacts.has(fact));
  if (audited.related !== true || audited.affectsSolving !== problem.visualContext.affectsSolving || !sameFacts) throw new Error("模型复核结果与已确认的图中条件不一致，请重新分析");
}

function compactFact(value: string): string {
  return value.normalize("NFKC").replace(/[\s，。；：、“”‘’（）()]/g, "").toLowerCase();
}

export function tutorImageInstruction(isOriginalProblemImage: boolean): string {
  return isOriginalProblemImage
    ? "\n附图是当前原题照片。必须联合题干、原图及复核后的 visualContext 回应；只采用能从原图核验的条件，不得把邻题、二维码或手写草稿当成题设。"
    : "\n学生还附上了一张当前作答或草图。必须结合图片回应，但不要把它误认为一道新题。";
}
