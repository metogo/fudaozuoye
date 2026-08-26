import { getConcept, isSupportedSubjectBand, listConcepts } from "../curriculum";
import { providerError } from "../errors";
import { assertGraphInvariants } from "../graph";
import { analyzeMock, expandMock, recognizeMock, solutionMock, transferCheckMock, verifyMock } from "../mock-engine";
import type { CheckItem, KnowledgeEdge, KnowledgeNode, LearningSession, ProblemSnapshot, ProviderId } from "../types";
import {
  blueprintCheckSignature,
  blueprintContentSignature,
  createProblemRoot,
  knowledgeNodeFromBlueprint,
  parseKnowledgeBlueprints,
  parseKnowledgeSelections,
  type KnowledgeBlueprint,
  type KnowledgeSelection,
  type EvidenceSource,
} from "./blueprint";
import type { ProviderConfig } from "./config";

type AnalysisPhaseReporter = (key: string, label: string) => void;

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly modelId: string;
  readonly mode: "demo" | "live";
  recognizeProblem(imageDataUrl: string, subject?: ProblemSnapshot["subject"], gradeBand?: ProblemSnapshot["gradeBand"]): Promise<ProblemSnapshot>;
  analyzeProblem(problem: ProblemSnapshot, onPhase?: AnalysisPhaseReporter): Promise<LearningSession>;
  expandNode(session: LearningSession, targetNodeId: string, onPhase?: AnalysisPhaseReporter): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }>;
  verifyAnswer(check: CheckItem, answer: string): Promise<{ passed: boolean; explanation: string }>;
  generateTransferCheck(session: LearningSession): Promise<CheckItem>;
  solveProblem(problem: ProblemSnapshot): Promise<string>;
  streamSolution(problem: ProblemSnapshot, onDelta: (text: string) => void): Promise<void>;
}

export class MockProviderAdapter implements ProviderAdapter {
  readonly modelId: string;
  readonly mode = "demo" as const;

  constructor(readonly id: ProviderId) {
    this.modelId = `${id}-demo`;
  }

  async recognizeProblem(_imageDataUrl: string, subject: ProblemSnapshot["subject"] = "math", gradeBand: ProblemSnapshot["gradeBand"] = "primary") {
    return recognizeMock(subject, gradeBand);
  }

  async analyzeProblem(problem: ProblemSnapshot) { return analyzeMock(problem, this.id); }
  async expandNode(session: LearningSession, targetNodeId: string, onPhase?: AnalysisPhaseReporter) { void onPhase; return expandMock(session, targetNodeId); }
  async verifyAnswer(check: CheckItem, answer: string) { return verifyMock(check, answer); }
  async generateTransferCheck(session: LearningSession) { return transferCheckMock(session.problem.subject, session.problem.gradeBand); }
  async solveProblem(problem: ProblemSnapshot) { return solutionMock(problem); }
  async streamSolution(problem: ProblemSnapshot, onDelta: (text: string) => void) {
    const solution = solutionMock(problem);
    for (const part of solution.match(/.{1,12}/gs) ?? [solution]) onDelta(part);
  }
}

type JsonObject = Record<string, unknown>;
class NonRepairableValidationError extends Error {}

export class LiveProviderAdapter implements ProviderAdapter {
  readonly mode = "live" as const;
  readonly id: ProviderId;
  readonly modelId: string;

  constructor(private readonly config: ProviderConfig, private readonly fetcher: typeof fetch = fetch) {
    this.id = config.id;
    this.modelId = config.modelId;
  }

  async recognizeProblem(imageDataUrl: string, subject?: ProblemSnapshot["subject"], gradeBand?: ProblemSnapshot["gradeBand"]): Promise<ProblemSnapshot> {
    void subject;
    void gradeBand;
    return this.validatedJsonRequest(
      "你是严格的作业照片门禁与识别器。先判断图片里是否真实、清晰、完整地出现至少一道数学、物理或化学题。只看到天花板、墙面、人物、空白纸、无关物体、严重模糊、题干被裁断或多题无法分离时，绝对禁止猜测、补全或套用示例，必须返回 recognized=false。只有能逐字依据图片提取完整题干时才返回 recognized=true。只识别一道题及孩子已有作答，不求解。输出严格 JSON。",
      "请根据题干中的术语、公式与难度自行判断学科和学段；没有足够依据时，选择更保守的学段并降低 confidence。学科为 physics 或 chemistry 时 gradeBand 不得为 primary。输出字段：recognized(boolean), failureReason(string；成功时为空), text(string；失败时为空), childWork(string；失败时为空), subject(math|physics|chemistry), gradeBand(primary|junior|senior), confidence(0到1；失败时为0)。",
      parseProblem,
      imageDataUrl,
    );
  }

  async analyzeProblem(problem: ProblemSnapshot, onPhase?: AnalysisPhaseReporter): Promise<LearningSession> {
    const allowed = listConcepts(problem.subject, problem.gradeBand).map((item) => ({
      id: item.id,
      title: item.title,
      aliases: item.aliases,
      difficulty: item.difficulty,
      atomic: item.atomic,
    }));
    const result = await this.validatedJsonRequest(
      selectionSystemPrompt(1, 4),
      JSON.stringify({
        task: "找出孩子独立完成这道原题真正需要的 1 到 4 个直接前置知识；简单题只选 1 个，不得凑数",
        problem,
        evidenceQuotes: evidenceCandidates(problemEvidenceSources(problem)),
        output: selectionOutputExample(true),
        allowedConcepts: allowed,
      }),
      (value) => {
        const selections = parseKnowledgeSelections(value, {
          allowedConceptIds: allowed.map((item) => item.id),
          evidenceSources: problemEvidenceSources(problem),
          min: 1,
          max: 4,
          rejectAncestorPairs: true,
        });
        if (typeof value.originalAnswer !== "string" || !value.originalAnswer.trim() || typeof value.originalExplanation !== "string" || !value.originalExplanation.trim()) throw new Error("缺少原题标准答案或解题依据");
        return { selections, originalAnswer: value.originalAnswer, originalExplanation: value.originalExplanation };
      },
    );
    onPhase?.("teaching", `已定位 ${result.selections.length} 个直接前置，正在生成针对这道题的讲法与检查题`);
    const blueprints = await this.generateBlueprintBatch(result.selections, (
      selection,
      existingCheckPrompts,
      existingContentSignatures,
      avoidTeachingContent,
    ) => this.generateBlueprint(
      problem,
      selection,
      problemEvidenceSources(problem),
      { parentTitle: "原题", parentExplanation: problem.text },
      existingCheckPrompts,
      existingContentSignatures,
      avoidTeachingContent,
    ));
    return buildSession(problem, this.id, this.modelId, blueprints, result.originalAnswer, result.originalExplanation);
  }

  async expandNode(session: LearningSession, targetNodeId: string, onPhase?: AnalysisPhaseReporter): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }> {
    const target = session.nodes.find((node) => node.id === targetNodeId);
    if (!target) throw new Error("找不到要拆解的知识点");
    const concept = getConcept(target.conceptId);
    if (!concept || concept.atomic || concept.prerequisites.length === 0) throw new Error("这个知识点已经是当前课标下的最小概念");
    const allowed = concept.prerequisites.map((id) => {
      const prerequisite = getConcept(id);
      return { id, title: prerequisite?.title, aliases: prerequisite?.aliases, difficulty: prerequisite?.difficulty };
    });
    const selections = await this.validatedJsonRequest(
      selectionSystemPrompt(1, concept.prerequisites.length),
      JSON.stringify({
        task: "只选择理解当前 target 真正缺失的直接前置",
        problem: session.problem,
        target: {
          conceptId: target.conceptId,
          title: target.title,
          simplification: target.simplification,
          teachingExplanation: target.teaching.explanation,
        },
        evidenceQuotes: evidenceCandidates(expansionEvidenceSources(session.problem, target)),
        output: selectionOutputExample(false),
        allowedPrerequisites: allowed,
        existingConceptIds: session.nodes.filter((node) => node.kind === "concept").map((node) => node.conceptId),
      }),
      (value) => parseKnowledgeSelections(value, {
        allowedConceptIds: concept.prerequisites,
        evidenceSources: expansionEvidenceSources(session.problem, target),
        min: 1,
        max: concept.prerequisites.length,
      }),
    );
    const existingContentSignatures = session.nodes.filter((node) => node.kind === "concept").map((node) => blueprintContentSignature({
          conceptId: node.conceptId,
          evidence: node.diagnosticEvidence ?? node.title,
          evidenceSource: node.diagnosticEvidenceSource ?? "parent",
          simplification: node.simplification,
          teaching: node.teaching,
          check: node.check,
        }));
    const evidenceSources = expansionEvidenceSources(session.problem, target);
    onPhase?.("teaching", `已定位 ${selections.length} 个更简单前置，正在生成针对这道题的讲法与检查题`);
    const blueprints = await this.generateBlueprintBatch(selections, (
      selection,
      acceptedChecks,
      acceptedContent,
      avoidTeachingContent,
    ) => this.generateBlueprint(
      session.problem,
      selection,
      evidenceSources,
      { parentTitle: target.title, parentExplanation: target.teaching.explanation },
      [...session.nodes.map((node) => node.check.prompt), ...acceptedChecks],
      [...existingContentSignatures, ...acceptedContent],
      avoidTeachingContent,
    ));
    const nodes = blueprints.map(knowledgeNodeFromBlueprint);
    return {
      nodes,
      edges: nodes.map((node, index) => ({
        from: node.id,
        to: target.id,
        reason: edgeReason(node, blueprints[index], target.title),
      })),
    };
  }

  private async generateBlueprint(
    problem: ProblemSnapshot,
    selection: KnowledgeSelection,
    evidenceSources: EvidenceSource[],
    parent: { parentTitle: string; parentExplanation: string },
    existingCheckPrompts: string[] = [],
    existingContentSignatures: string[] = [],
    avoidTeachingContent: string[] = [],
  ): Promise<KnowledgeBlueprint> {
    const concept = getConcept(selection.conceptId);
    if (!concept) throw new Error(`课程目录中不存在知识点：${selection.conceptId}`);
    return this.validatedJsonRequest(
      diagnosticSystemPrompt(),
      JSON.stringify({
        task: "为已确认的课标概念生成当前题专属的家长讲法与微型检查；不得更换概念、证据或简化理由",
        problem,
        selected: { ...selection, title: concept.title, aliases: concept.aliases },
        parent,
        avoidCheckPrompts: existingCheckPrompts,
        avoidTeachingContent,
        output: teachingOutputExample(),
      }),
      (value) => {
        const detail = normalizeBlueprintDetail(value, selection.conceptId);
        return parseKnowledgeBlueprints({ nodes: [{ ...detail, ...selection }] }, {
        allowedConceptIds: [selection.conceptId],
        evidenceSources,
        min: 1,
        max: 1,
        existingCheckPrompts,
        existingContentSignatures,
        })[0];
      },
    );
  }

  private async generateBlueprintBatch(
    selections: KnowledgeSelection[],
    generate: (
      selection: KnowledgeSelection,
      existingCheckPrompts: string[],
      existingContentSignatures: string[],
      avoidTeachingContent: string[],
    ) => Promise<KnowledgeBlueprint>,
  ): Promise<KnowledgeBlueprint[]> {
    const initial = await Promise.all(selections.map((selection) => generate(selection, [], [], [])));
    const accepted: KnowledgeBlueprint[] = [];
    for (const candidate of initial) {
      const check = blueprintCheckSignature(candidate);
      const content = blueprintContentSignature(candidate);
      const conflicts = accepted.some((item) => blueprintCheckSignature(item) === check || blueprintContentSignature(item) === content);
      const blueprint = conflicts
        ? await generate(
          selections.find((selection) => selection.conceptId === candidate.conceptId)!,
          accepted.map((item) => item.check.prompt),
          accepted.map(blueprintContentSignature),
          accepted.flatMap((item) => [item.teaching.explanation, item.teaching.example]),
        )
        : candidate;
      accepted.push(blueprint);
    }
    assertBlueprintBatchUnique(accepted);
    return accepted;
  }

  async verifyAnswer(check: CheckItem, answer: string): Promise<{ passed: boolean; explanation: string }> {
    return this.validatedJsonRequest(
      "你是严格的微型学习验收器。根据标准答案判断作答是否语义等价，不因表述差异误判。输出严格 JSON。",
      JSON.stringify({ prompt: check.prompt, expected: check.answer, answer, output: { passed: true, explanation: "一句反馈" } }),
      (value) => {
        if (typeof value.passed !== "boolean" || typeof value.explanation !== "string" || !value.explanation.trim()) throw new Error("验收结果缺少 passed 或 explanation");
        return { passed: value.passed, explanation: value.explanation.trim() };
      },
    );
  }

  async generateTransferCheck(session: LearningSession): Promise<CheckItem> {
    const directIds = new Set(session.edges.filter((edge) => edge.to === session.rootNodeId).map((edge) => edge.from));
    const target = session.nodes.filter((node) => directIds.has(node.id) && node.kind === "concept").sort((a, b) => b.difficulty - a.difficulty)[0];
    if (!target) throw new Error("找不到迁移题对应的核心知识点");
    const system = "你是迁移题生成器。生成一道同知识点、不同数字或表述、难度相近的短题。";
    const prompt = JSON.stringify({ problem: session.problem, targetConcept: { id: target.conceptId, title: target.title } });
    const parse = (value: JsonObject) => {
      if (typeof value.prompt !== "string" || !value.prompt.trim() || typeof value.answer !== "string" || !value.answer.trim() || typeof value.explanation !== "string" || !value.explanation.trim()) throw new Error("迁移题缺少 prompt、answer 或 explanation");
      return { id: `transfer-${crypto.randomUUID().slice(0, 8)}`, conceptId: target.conceptId, type: "short_text" as const, prompt: value.prompt.trim(), answer: value.answer.trim(), explanation: value.explanation.trim() };
    };
    if (this.config.protocol === "chat-completions") {
      return this.validatedToolRequest(system, prompt, transferCheckTool(), parse);
    }
    return this.validatedJsonRequest(`${system} 输出严格 JSON。`, prompt, parse);
  }

  async solveProblem(problem: ProblemSnapshot): Promise<string> {
    return this.textRequest(solutionSystemPrompt(), JSON.stringify(problem));
  }

  async streamSolution(problem: ProblemSnapshot, onDelta: (text: string) => void): Promise<void> {
    await this.streamTextRequest(solutionSystemPrompt(), JSON.stringify(problem), onDelta);
  }

  private async validatedJsonRequest<T>(system: string, prompt: string, parse: (value: JsonObject) => T, imageDataUrl?: string): Promise<T> {
    const first = await this.textRequest(system, prompt, imageDataUrl, true);
    try { return parse(parseJsonObject(first)); } catch (error) {
      if (error instanceof NonRepairableValidationError) throw error;
      const repaired = await this.textRequest(
        `${system}\n这是唯一一次修复机会。必须针对校验错误修正完整结果；原文证据必须逐字复制，不能概括或改写。只输出严格 JSON。`,
        `${repairContext(prompt)}\n\n上一次输出未通过校验：${error instanceof Error ? error.message : "结构不合法"}\n上一次输出：${first.slice(0, 8000)}\n请重新完成原任务并输出完整 JSON。`,
        imageDataUrl,
        true,
      );
      return parse(parseJsonObject(repaired));
    }
  }

  private async validatedToolRequest<T>(system: string, prompt: string, tool: JsonObject, parse: (value: JsonObject) => T): Promise<T> {
    const first = await this.toolRequest(system, prompt, tool);
    try { return parse(parseJsonObject(first)); } catch (error) {
      const repaired = await this.toolRequest(
        "你是结构修复器。根据校验错误重新调用指定函数；不得缺少必填字段，不改变题目事实。",
        JSON.stringify({ originalRequirement: prompt.slice(0, 6000), validationError: error instanceof Error ? error.message : "结构不合法", invalidOutput: first.slice(0, 6000) }),
        tool,
      );
      return parse(parseJsonObject(repaired));
    }
  }

  private async toolRequest(system: string, prompt: string, tool: JsonObject): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await this.fetcher(this.config.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify(chatToolBody(this.modelId, system, prompt, tool, this.id === "doubao")),
        signal: controller.signal,
      });
      if (!response.ok) throw providerError(`模型请求失败（${response.status}）`, response.status === 429 ? 429 : 502);
      return extractToolArguments(await response.json() as JsonObject);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw providerError("模型响应超时，请稍后重试同一模型", 504);
      throw error;
    } finally { clearTimeout(timeout); }
  }

  private async textRequest(system: string, prompt: string, imageDataUrl?: string, jsonMode = false): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await this.fetcher(this.config.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify(this.config.protocol === "responses"
          ? responsesBody(this.modelId, system, prompt, imageDataUrl)
          : chatBody(this.modelId, system, prompt, imageDataUrl, jsonMode, this.id === "doubao")),
        signal: controller.signal,
      });
      if (!response.ok) throw providerError(`模型请求失败（${response.status}）`, response.status === 429 ? 429 : 502);
      const payload = await response.json() as JsonObject;
      return extractText(payload, this.config.protocol);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw providerError("模型响应超时，请稍后重试同一模型", 504);
      throw error;
    } finally { clearTimeout(timeout); }
  }

  private async streamTextRequest(system: string, prompt: string, onDelta: (text: string) => void): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await this.fetcher(this.config.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify(this.config.protocol === "responses"
          ? { ...responsesBody(this.modelId, system, prompt), stream: true }
          : { ...chatBody(this.modelId, system, prompt, undefined, false, this.id === "doubao"), stream: true }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw providerError(`模型流式请求失败（${response.status}）`, response.status === 429 ? 429 : 502);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? "";
        for (const line of lines) emitProviderDelta(line, this.config.protocol, onDelta);
      }
      if (buffer.trim()) emitProviderDelta(buffer, this.config.protocol, onDelta);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw providerError("模型响应超时，请稍后重试同一模型", 504);
      throw error;
    } finally { clearTimeout(timeout); }
  }
}

function repairContext(prompt: string): string {
  if (prompt.length <= 18_000) return prompt;
  return `${prompt.slice(0, 7_000)}\n…中间课程目录省略…\n${prompt.slice(-11_000)}`;
}

function responsesBody(model: string, system: string, prompt: string, image?: string) {
  const content: JsonObject[] = image ? [{ type: "input_image", image_url: image, detail: "high" }, { type: "input_text", text: prompt }] : [{ type: "input_text", text: prompt }];
  return { model, instructions: system, input: [{ role: "user", content }], store: false };
}

function chatBody(model: string, system: string, prompt: string, image?: string, jsonMode = false, disableThinking = false) {
  const content: JsonObject[] = image ? [{ type: "image_url", image_url: { url: image } }, { type: "text", text: prompt }] : [{ type: "text", text: prompt }];
  return {
    model,
    messages: [{ role: "system", content: system }, { role: "user", content }],
    stream: false,
    max_tokens: 3000,
    ...(disableThinking ? { thinking: { type: "disabled" } } : {}),
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  };
}

function chatToolBody(model: string, system: string, prompt: string, tool: JsonObject, disableThinking = false) {
  const name = ((tool.function as JsonObject).name as string);
  return {
    model,
    messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    tools: [tool],
    tool_choice: { type: "function", function: { name } },
    stream: false,
    max_tokens: 3000,
    ...(disableThinking ? { thinking: { type: "disabled" } } : {}),
  };
}

function transferCheckTool(): JsonObject {
  return {
    type: "function",
    function: {
      name: "submit_transfer_check",
      description: "提交完整的迁移题、标准答案和解题依据",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "迁移题题干" },
          answer: { type: "string", description: "可核验的标准答案" },
          explanation: { type: "string", description: "简洁解题依据" },
        },
        required: ["prompt", "answer", "explanation"],
        additionalProperties: false,
      },
    },
  };
}

function extractToolArguments(payload: JsonObject): string {
  const choices = payload.choices as Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }> | undefined;
  const argumentsText = choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (argumentsText) return argumentsText;
  throw new Error("模型没有调用指定的迁移题结构函数");
}

function extractText(payload: JsonObject, protocol: ProviderConfig["protocol"]): string {
  if (protocol === "chat-completions") {
    const choices = payload.choices as Array<{ message?: { content?: string } }> | undefined;
    const text = choices?.[0]?.message?.content;
    if (text) return text;
  }
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = payload.output as Array<{ content?: Array<{ text?: string }> }> | undefined;
  const text = output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("");
  if (text) return text;
  throw new Error("模型返回中没有可读取的文本");
}

function emitProviderDelta(line: string, protocol: ProviderConfig["protocol"], onDelta: (text: string) => void) {
  if (!line.startsWith("data:")) return;
  const raw = line.slice(5).trim();
  if (!raw || raw === "[DONE]") return;
  const event = JSON.parse(raw) as JsonObject;
  if (protocol === "chat-completions") {
    const choices = event.choices as Array<{ delta?: { content?: string } }> | undefined;
    const delta = choices?.[0]?.delta?.content;
    if (delta) onDelta(delta);
    return;
  }
  if (event.type === "response.output_text.delta" && typeof event.delta === "string") onDelta(event.delta);
}

function solutionSystemPrompt(): string {
  return "你是面向家长的解题助手。给出简洁、可核验的完整步骤，不扩展无关知识。使用中性、非羞辱性语言，不评价孩子能力；输出纯文本，不使用 Markdown 标题或分隔线。";
}

function parseJsonObject(raw: string): JsonObject {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("模型没有返回 JSON 对象");
  return parsed as JsonObject;
}

function parseProblem(result: JsonObject): ProblemSnapshot {
  if (result.recognized !== true) {
    const reason = typeof result.failureReason === "string" && result.failureReason.trim() ? `：${result.failureReason.trim()}` : "";
    throw new NonRepairableValidationError(`照片中没有识别到清晰完整的一道题${reason}，请重新拍摄并只保留题目区域`);
  }
  if (typeof result.text !== "string" || result.text.trim().length < 3) throw new Error("没有识别到完整题干");
  if (typeof result.childWork !== "string" || !["math", "physics", "chemistry"].includes(String(result.subject)) || !["primary", "junior", "senior"].includes(String(result.gradeBand)) || typeof result.confidence !== "number" || result.confidence < 0 || result.confidence > 1) throw new Error("模型识别结果结构不合法");
  if (result.confidence < 0.55) throw new NonRepairableValidationError("照片识别置信度过低，请重新拍摄并确保题干清晰、完整、无反光");
  const subject = result.subject as ProblemSnapshot["subject"];
  const gradeBand = result.gradeBand as ProblemSnapshot["gradeBand"];
  if (!isSupportedSubjectBand(subject, gradeBand)) throw new Error("识别到不支持的学科学段组合");
  return { text: result.text.trim(), childWork: result.childWork.trim(), subject, gradeBand, confidence: result.confidence, userRevised: false };
}

function buildSession(problem: ProblemSnapshot, provider: ProviderId, modelId: string, blueprints: KnowledgeBlueprint[], originalAnswer: string, originalExplanation: string): LearningSession {
  const root = createProblemRoot(problem, originalAnswer, originalExplanation);
  const nodes = blueprints.map(knowledgeNodeFromBlueprint);
  const now = new Date().toISOString();
  const session: LearningSession = {
    schemaVersion: "1.0",
    provider,
    modelId,
    mode: "live",
    requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
    problem,
    nodes: [root, ...nodes],
    edges: nodes.map((node, index) => ({ from: node.id, to: root.id, reason: edgeReason(node, blueprints[index], "原题") })),
    rootNodeId: root.id,
    currentNodeId: nodes.slice().sort((a, b) => a.difficulty - b.difficulty)[0]?.id ?? null,
    stage: "diagnosing",
    evidence: [],
    transferCheck: null,
    originalPassed: false,
    transferPassed: false,
    createdAt: now,
    updatedAt: now,
  };
  assertGraphInvariants(session);
  return session;
}

function diagnosticSystemPrompt(): string {
  return [
    "你是中国 K12 数理化知识诊断与家长辅导设计器。输出严格 JSON。",
    "课程概念只能从给定 ID 选择，标题、难度和前置关系不得自创。",
    "只选直接前置：若 A 已是 B 的课标前置且 B 足以解释原题，不要再把 A 与 B 并列为原题的直接前置。",
    "不要因为题里出现数字就机械选择加减乘除或变量；必须说明孩子完成当前题的哪一步离不开该概念。",
    "evidence 必须逐字摘自题干、孩子作答或给定父节点，且 simplification 必须原样引用 evidence 并解释为何先学这个概念。",
    "每个节点的讲解、例子、家长提问、误区和微型检查都要针对当前题重新生成；禁止通用模板和复用原题。",
    "微型检查必须比父题简单，只检查一个概念；选择题 answer 必须与某个 choices 选项逐字一致。",
    "手机页面需要简洁：explanation 不超过140字，example不超过110字，parentPrompt不超过70字，expectedSignal不超过90字，misconception不超过100字，alternateExplanation不超过140字，check.prompt不超过120字。",
  ].join("\n");
}

function selectionSystemPrompt(min: number, max: number): string {
  return [
    "你是中国 K12 数理化知识诊断器。输出严格 JSON，回答保持简短。",
    `只能从给定课程目录 ID 选择 ${min} 到 ${max} 个完成当前任务真正需要的直接前置；只需一个时绝不凑数。`,
    "不能把具有课程前置关系的上下游概念并列，应该只保留最贴近当前任务的下游概念。",
    "不要因为题里出现数字就机械选择加减乘除或变量；必须对应题目的关键关系或孩子作答暴露的具体错误。",
    "evidence 必须逐字复制 evidenceQuotes 中某一项的 text，禁止自行摘写、概括、增删字或替换单位/数字；把它原样粘贴进 simplification，并明确说明这一步缺少什么能力。",
    "若多个概念表达同一层关系，只保留更贴近当前卡点的一个；不要输出教学正文或检查题。",
  ].join("\n");
}

function selectionOutputExample(includeOriginal: boolean): JsonObject {
  return {
    selections: [{
      conceptId: "给定课程概念 ID",
      evidence: "从原文复制且不超过50字的连续短语",
      simplification: "引用上述 evidence，说明为何这是直接前置以及先学它降低了什么难度",
    }],
    ...(includeOriginal ? { originalAnswer: "原题标准答案", originalExplanation: "简洁可核验的解题依据" } : {}),
  };
}

function teachingOutputExample(): JsonObject {
  return {
    conceptId: "必须与 selected.conceptId 完全一致",
    evidenceSource: "必须与 selected.evidenceSource 完全一致：problem、child_work 或 parent",
    teaching: {
      explanation: "家长可直接说给孩子听的讲法；必须原样引用 selected.evidence 并明确点出所选课程概念名称",
      example: "数字更小或情境更具体但关系相同的新例子",
      parentPrompt: "建议家长向孩子提出的问题",
      expectedSignal: "真正理解时孩子会说出或做出的表现",
      misconception: "当前题最可能出现的具体误区",
      alternateExplanation: "第一次仍不懂时可使用的另一种具体讲法",
    },
    check: {
      prompt: "不同于原题、只检查该概念的一道微型题",
      type: "choice 或 short_text",
      choices: ["选择题时提供 2 到 5 个互不重复选项"],
      answer: "可核验标准答案；选择题须逐字等于某个选项",
      explanation: "必须明确写出所选课程概念标题或别名，并说明为什么答案能证明掌握该概念",
    },
  };
}

function edgeReason(node: KnowledgeNode, blueprint: KnowledgeBlueprint | undefined, targetTitle: string): string {
  const evidence = blueprint?.evidence ?? node.diagnosticEvidence ?? node.title;
  return `“${evidence}”表明${node.title}是理解${targetTitle}所需的直接前置`;
}

function assertBlueprintBatchUnique(blueprints: KnowledgeBlueprint[]): void {
  const checks = new Set<string>();
  const content = new Set<string>();
  for (const blueprint of blueprints) {
    const check = blueprintCheckSignature(blueprint);
    const signature = blueprintContentSignature(blueprint);
    if (checks.has(check)) throw new Error(`模型为多个知识点生成了重复检查题：${blueprint.check.prompt}`);
    if (content.has(signature)) throw new Error(`模型为多个知识点生成了重复教学内容：${blueprint.conceptId}`);
    checks.add(check);
    content.add(signature);
  }
}

function normalizeBlueprintDetail(value: JsonObject, expectedConceptId: string): JsonObject {
  const matches = findBlueprintDetails(value, 0);
  if (matches.length > 1) throw new Error("模型返回了多个教学节点，无法确认哪一个属于当前概念");
  const nested = matches[0];
  if (nested) {
    if (nested.conceptId !== undefined && nested.conceptId !== expectedConceptId) throw new Error("教学内容对应了错误的课程概念");
    return nested;
  }
  if (value.check && typeof value.check === "object" && !Array.isArray(value.check)) {
    const explanation = typeof value.teaching === "string" ? value.teaching : typeof value.explanation === "string" ? value.explanation : undefined;
    if (explanation) {
      return {
        teaching: {
          explanation,
          example: value.example,
          parentPrompt: value.parentPrompt,
          expectedSignal: value.expectedSignal,
          misconception: value.misconception,
          alternateExplanation: value.alternateExplanation,
        },
        check: value.check,
      };
    }
  }
  return value;
}

function findBlueprintDetails(value: unknown, depth: number): JsonObject[] {
  if (!value || typeof value !== "object" || depth > 3) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => findBlueprintDetails(item, depth + 1));
  }
  const object = value as JsonObject;
  const teachingIsObject = Boolean(object.teaching && typeof object.teaching === "object" && !Array.isArray(object.teaching));
  const checkIsObject = Boolean(object.check && typeof object.check === "object" && !Array.isArray(object.check));
  if (teachingIsObject && checkIsObject) return [object];
  return Object.values(object).flatMap((child) => findBlueprintDetails(child, depth + 1));
}

function problemEvidenceSources(problem: ProblemSnapshot): EvidenceSource[] {
  return [
    { type: "problem", text: problem.text },
    ...(problem.childWork ? [{ type: "child_work" as const, text: problem.childWork }] : []),
  ];
}

function expansionEvidenceSources(problem: ProblemSnapshot, target: KnowledgeNode): EvidenceSource[] {
  return [
    ...problemEvidenceSources(problem),
    { type: "parent", text: target.title },
    { type: "parent", text: target.simplification },
    { type: "parent", text: target.teaching.explanation },
  ];
}

function evidenceCandidates(sources: EvidenceSource[]): EvidenceSource[] {
  const candidates = sources.flatMap((source) => {
    const parts = source.text.split(/[，。；：？！,;:?!\n]+/).map((part) => part.trim()).filter((part) => part.length >= 2 && part.length <= 50);
    return [
      ...(source.text.trim().length <= 50 ? [{ ...source, text: source.text.trim() }] : []),
      ...parts.map((text) => ({ ...source, text })),
    ];
  });
  return candidates.filter((candidate, index) => candidates.findIndex((item) => item.type === candidate.type && item.text === candidate.text) === index).slice(0, 16);
}
