import type { BoardLesson, BoardSemanticVisual, GradeBand, ProblemSnapshot } from "./types";

export const gradeBands: readonly GradeBand[] = ["primary", "junior", "senior"];

export const gradeBandLabels: Record<GradeBand, string> = {
  primary: "小学",
  junior: "初中",
  senior: "高中",
};

export type TeachingSurface = "diagnosis" | "chat" | "solution" | "exercise" | "feedback" | "suggestion" | "board";

const surfaceGoals: Record<TeachingSurface, string> = {
  diagnosis: "生成题目引导、知识讲解和理解检查",
  chat: "直接回应学生当前卡点",
  solution: "写出可从头跟做的完整讲解",
  exercise: "生成题目、提示和解题依据",
  feedback: "判断作答并给出下一步建议",
  suggestion: "生成学生此刻看得懂的追问",
  board: "组织板书标题、步骤、说明和自查问题",
};

const surfaceContracts: Record<GradeBand, Record<TeachingSurface, string>> = {
  primary: {
    diagnosis: "题目引导的每个字段最多两句短句；先指出题目中的具体对象，再让学生只完成一个动作。例子优先沿用本题对象与数字，不另造陌生情境。",
    chat: "用 2 到 3 个短段落回应；本轮只推进一个动作和一个理由。需要举例时，直接换用本题对象和更小的数字，最后问学生下一步要算、找或比较什么。",
    solution: "每个编号步骤只做一个计算、判断或摘取动作，并紧跟一句理由；先写白话关系，再写必要算式。不得把多个任务塞进同一步。",
    exercise: "一次只检查一个动作；题干短而具体，提示直接指出先找什么，解析按“做什么—为什么”展开。",
    feedback: "先明确哪一步对或不对，再只给一个可以立即执行的检查动作；不要一次布置多个修正任务。",
    suggestion: "问题只问一个具体动作，优先使用“先算什么、先找哪句、先比较什么”，不问抽象的方法论。",
    board: "一块内容只呈现一个动作及其理由；用本题对象、箭头、圈注或简单算式建立联系，避免抽象步骤名。",
  },
  junior: {
    diagnosis: "按“规范术语—白话解释—题内证据”组织每个关键点；引导问题要求学生说出条件怎样连接，而不只报出计算结果。",
    chat: "按“条件—操作—理由”推进，可先使用课内术语，但必须紧跟一句白话解释；例子与当前题保持同一关系。",
    solution: "每个编号步骤写清使用的条件、执行的操作和成立理由；公式与文字解释配对，不能只列算式。",
    exercise: "检查学生能否识别同一关系并说明依据；解析明确指出条件怎样支持操作。",
    feedback: "指出错误落在条件、操作还是理由，再给对应的复核方法。",
    suggestion: "问题指向条件之间的联系、某一步成立的理由或一种直接检验方法。",
    board: "用课内术语标记关系，并用一句白话解释箭头、公式或对照项为什么成立。",
  },
  senior: {
    diagnosis: "优先定义对象或变量，压缩为约束、关系式或论证链；引导问题指向建式依据、必要条件、适用范围或边界。",
    chat: "能用变量、关系式或材料证据直接说明时就直接表达；按“定义—推导—依据”组织，追问论证依据、适用条件或边界。",
    solution: "先定义符号或对象，再列关系并逐步推导；交代公式、定理或材料证据的使用条件，结论注明适用范围和易错边界。",
    exercise: "检查关系的建立、论证依据或条件变化后的结论；避免只做机械代入。",
    feedback: "定位关系式、论证依据或边界条件中的错误，并指出最短复核路径。",
    suggestion: "问题优先追问建式依据、充分必要性、适用条件、反例或边界，不用低龄生活类比包装。",
    board: "优先呈现变量定义、关系式、证据链与边界条件；图示服务于推导，不用装饰性类比。",
  },
};

export function teachingBandOf(problem: Pick<ProblemSnapshot, "gradeBand" | "learnerBand">): GradeBand {
  return problem.learnerBand ?? problem.gradeBand;
}

export function withLearnerBand(problem: ProblemSnapshot, learnerBand: GradeBand): ProblemSnapshot {
  return { ...problem, learnerBand };
}

export function gradeTeachingInstruction(band: GradeBand, surface: TeachingSurface): string {
  const shared = `当前学生学段：${gradeBandLabels[band]}。本次任务：${surfaceGoals[surface]}。保持学科事实、必要步骤与结论准确，不降低知识要求，只调整表达方式。`;
  if (band === "primary") return [
    shared,
    "小学教学结构：一个动作、一个理由。一句只讲一个意思，优先使用题目中已有的具体对象、动作和数字。",
    "必要学科术语必须保留，但第一次出现时先用一句白话解释；不得直接使用“建模、量纲、变量控制、证据边界、迁移骨架、等价变换”等抽象教学词而不解释。",
    "每次最多推进一个关键关系。不要使用居高临下、幼儿化、卖萌或评价能力的语气。",
    surfaceContracts.primary[surface],
  ].join("\n");
  if (band === "junior") return [
    shared,
    "初中教学结构：规范术语—白话解释—题内依据。步骤清楚写出条件、操作和理由。",
    "避免连续堆叠抽象名词和过长复句；每段围绕一个关键关系，并给出一个贴近当前题的小例子或检查方法。",
    surfaceContracts.junior[surface],
  ].join("\n");
  return [
    shared,
    "高中教学结构：定义对象或变量—建立关系—给出推导依据—检查适用条件与边界。使用规范、紧凑的课内表达。",
    "能用变量、关系式、图示或材料证据直接表达时，不另造“小朋友、糖果、折纸、拼图”等低龄类比；题干本身包含的生活情境必须忠实保留。",
    "不要为了显得简洁而跳过决定结论的中间步骤。",
    surfaceContracts.senior[surface],
  ].join("\n");
}

export type GradeLanguageIssue = "abstract_meta_language" | "sentence_too_long" | "too_many_actions" | "childish_analogy";

const primaryMetaTerms = [
  "题意成模", "关系结构", "依据变换", "反查边界", "迁移骨架", "量纲校验", "现象回译", "答案落点", "证据边界",
  "因果链", "结构骨架", "变量表", "概念边界", "结论边界", "方程式复核", "类型判定", "建模", "变量控制",
  "定义域", "等价变换", "反例",
];

const childishAnalogyPatterns = [
  /小朋友.{0,10}(?:折(?:纸|千纸鹤)|拼(?:图|积木)|分(?:糖果|饼干)|吃糖果)/,
  /(?:糖果|饼干|贴纸|小红花).{0,10}(?:分给|奖励|小朋友)/,
  /(?:把|将).{0,12}(?:想成|比作|当成).{0,8}(?:糖果|饼干|贴纸|小红花|积木|玩具|卡通人物)/,
  /像.{0,10}(?:搭积木|玩游戏|分糖果|折纸|拼图)/,
];

export function inspectGradeLanguage(text: string, band: GradeBand, sourceText = "", surface: TeachingSurface = "chat"): GradeLanguageIssue[] {
  if (band === "senior") {
    const containsUnnecessaryAnalogy = childishAnalogyPatterns.some((pattern) => pattern.test(text) && !pattern.test(sourceText));
    return containsUnnecessaryAnalogy ? ["childish_analogy"] : [];
  }
  if (band !== "primary") return [];
  const issues: GradeLanguageIssue[] = [];
  if (primaryMetaTerms.some((term) => hasUnexplainedMetaTerm(text, sourceText, term))) issues.push("abstract_meta_language");
  const prose = maskSourceQuotes(text, sourceText).replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$/g, "公式").replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/\n(?!(?:\s*(?:[-*+]\s|\d+[.)、]\s)))/g, " ");
  const sentenceLimit = surface === "board" ? 96 : 72;
  if (prose.split(/[。！？!?.\n]/).some((sentence) => [...sentence.replace(/\s/g, "")].length > sentenceLimit && !containsSourceExcerpt(sentence, sourceText))) issues.push("sentence_too_long");
  const actionSentences = prose.split(/[。！？!?.\n]/).filter(Boolean);
  if (actionSentences.some(hasTooManySequentialActions)) issues.push("too_many_actions");
  if (surface !== "solution" && surface !== "board" && text.split(/\n{2,}/).some((paragraph) => !/^\s*\d+[.)、]\s/m.test(paragraph) && countMatches(paragraph, /(?:^|[。！？!?]\s*)(?:先|再|然后|接着|最后)/g) >= 3)) {
    if (!issues.includes("too_many_actions")) issues.push("too_many_actions");
  }
  return issues;
}

function maskSourceQuotes(text: string, sourceText: string): string {
  return sourceText.split(/[。！？!?\n]/).map((item) => item.trim()).filter((item) => item.length >= 8)
    .reduce((value, quote) => value.replaceAll(quote, "题目原文"), text);
}

function containsSourceExcerpt(text: string, sourceText: string): boolean {
  const compactText = text.replace(/\s/g, "");
  const compactSource = sourceText.replace(/\s/g, "");
  if (compactText.length < 24 || compactSource.length < 24) return false;
  return Array.from({ length: Math.max(0, compactText.length - 23) }, (_, index) => compactText.slice(index, index + 24))
    .some((excerpt) => compactSource.includes(excerpt));
}

export function assertGradeLanguage(text: string, band: GradeBand, label: string, sourceText = "", surface: TeachingSurface = "chat"): void {
  const issues = inspectGradeLanguage(text, band, sourceText, surface);
  if (!issues.length) return;
  const descriptions: Record<GradeLanguageIssue, string> = {
    abstract_meta_language: "含有未解释的抽象教学词",
    sentence_too_long: "单句过长",
    too_many_actions: "一句同时推进了太多动作",
    childish_analogy: "含有无必要的低龄类比",
  };
  throw new Error(`${label}不符合${gradeBandLabels[band]}表达要求：${issues.map((issue) => descriptions[issue]).join("、")}`);
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function hasTooManySequentialActions(sentence: string): boolean {
  const markers = Array.from(sentence.matchAll(/(?:先|再|然后|接着|最后)/g));
  if (markers.length < 3) return false;
  const actions = markers.map((marker, index) => {
    const start = marker.index! + marker[0].length;
    const end = markers[index + 1]?.index ?? sentence.length;
    return actionSignature(sentence.slice(start, end));
  }).filter(Boolean);
  return new Set(actions).size >= 3;
}

function actionSignature(clause: string): string {
  const raw = clause.replace(/[，,；;。！？!?\s]/g, "");
  const compact = raw.replace(/^(?:也得|要|把|将|从|用|对|去|来)+/, "");
  const verb = compact.match(/(?:圈出|找出|找到|挑出|理出|写出|写|列出|列式|计算|算出|求出|检查|比较|判断|代入|化简|画出|读出|确认|整理|想清|看清)/)?.[0];
  if (!verb) return /^(?:也得)?(?:把|将)/.test(raw) ? "" : compact.slice(0, 12);
  if (/圈出|找出|找到|挑出|理出/.test(verb)) return "locate";
  if (/写出|写|列出|列式/.test(verb)) return "form";
  if (/计算|算出|求出/.test(verb)) return "calculate";
  if (/想清|看清/.test(verb)) return "understand";
  return verb;
}

function hasUnexplainedMetaTerm(text: string, sourceText: string, term: string): boolean {
  if (!text.includes(term) || sourceText.includes(term)) return false;
  let index = text.indexOf(term);
  while (index >= 0) {
    const context = text.slice(Math.max(0, index - 28), Math.min(text.length, index + term.length + 36));
    if (!/(?:也就是|意思是|指的是|就是|可以理解为|说白了|换句话说|我们把.{0,16}叫作|称为)/.test(context)) return true;
    index = text.indexOf(term, index + term.length);
  }
  return false;
}

const primaryCopy: Array<[RegExp, string]> = [
  [/建模与推导/g, "找关系与推理"],
  [/定义域/g, "可以使用的范围"], [/等价变换/g, "等号两边做同样改变"], [/反例/g, "不成立的例子"], [/适用条件/g, "什么时候能用"],
  [/定对象—建关系—写依据—验边界/g, "看清对象—找出关系—说明理由—检查条件"],
  [/题意成模/g, "看懂题目"], [/关系结构/g, "找出联系"], [/依据变换/g, "一步步推"], [/反查边界/g, "检查易错"], [/迁移骨架/g, "举一反三"],
  [/量纲校验/g, "检查单位"], [/现象回译/g, "说回现象"], [/答案落点/g, "组织答案"], [/证据边界/g, "原文范围"], [/不变量/g, "始终不变的量"],
  [/研究系统/g, "研究对象"], [/规律适用/g, "选择规律"], [/物质身份/g, "认清物质"], [/守恒账本/g, "检查守恒"],
  [/结构—功能/g, "结构作用"], [/变量与对照/g, "改变与对比"], [/调节闭环/g, "调节过程"], [/词句解剖/g, "看关键词句"],
  [/语境作用/g, "这样写的作用"], [/结构主旨/g, "联系全文"], [/时空坐标/g, "时间地点"], [/史料事实/g, "材料事实"],
  [/要素清单/g, "找出要素"], [/概念匹配/g, "对应知识"], [/论证链/g, "说明理由"], [/因果链/g, "前因后果"],
  [/结构骨架/g, "看反应两边"], [/变量表/g, "分清各个条件"], [/概念边界/g, "分清概念"], [/结论边界/g, "结论范围"], [/方程式复核/g, "检查方程式"], [/类型判定/g, "判断类型"],
  [/Text evidence/g, "找到原文"], [/Sentence roles/g, "句子成分"], [/Discourse link/g, "上下文联系"], [/Meaning in context/g, "联系上下文"], [/Answer frame/g, "组织答案"],
  [/Clause structure/g, "句子结构"], [/Grammar signal/g, "语法提示词"], [/Rule in context/g, "使用规则"], [/Boundary check/g, "检查易错"], [/Verify choice/g, "读一遍检查"],
];

const juniorCopy: Array<[RegExp, string]> = [
  [/当前只锁定/g, "这一步先只看"], [/逐项/g, "一项一项"], [/反查/g, "回头检查"], [/约束/g, "限制条件"], [/表征/g, "表示方式"],
];

export function adaptTeachingCopy(text: string, band: GradeBand): string {
  const replacements = band === "primary" ? primaryCopy : band === "junior" ? juniorCopy : [];
  const adapted = replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
  return band === "primary" ? shortenPrimarySentences(adapted) : adapted;
}

export function adaptBoardLessonForGrade(lesson: BoardLesson, band: GradeBand): BoardLesson {
  if (band === "senior") return lesson;
  const adapt = (value?: string) => value === undefined ? undefined : adaptTeachingCopy(value, band);
  const adaptStructure = (value: string) => band === "primary" ? adaptTeachingCopy(value, band) : value;
  const scenes = lesson.plan?.scenes ?? [];
  const blocks = lesson.blocks.map((block, index) => ({
    ...block,
    label: adaptStructure(block.label),
    content: adaptOutsideProtected(block.content, [scenes[index]?.evidence, band === "junior" ? scenes[index]?.purpose : undefined], band),
  }));
  const annotations = lesson.annotations.map((item) => {
    const block = blocks.find((candidate) => candidate.id === item.blockId);
    const target = adaptTeachingCopy(item.target, band);
    return { ...item, target: block?.content.includes(target) ? target : item.target, reason: adaptTeachingCopy(item.reason, band) };
  });
  const plan = lesson.plan ? {
    ...lesson.plan,
    thesis: band === "primary" ? adapt(lesson.plan.thesis) : lesson.plan.thesis,
    learningGoal: adaptStructure(lesson.plan.learningGoal),
    scenes: lesson.plan.scenes.map((scene) => ({
      ...scene,
      title: adaptStructure(scene.title),
      content: adaptOutsideProtected(scene.content, [scene.evidence, band === "junior" ? scene.purpose : undefined], band),
      purpose: band === "primary" ? adapt(scene.purpose) : scene.purpose,
      why: band === "primary" ? adapt(scene.why) : scene.why,
      selfCheck: band === "primary" ? adapt(scene.selfCheck) : scene.selfCheck,
      visual: scene.visual ? adaptBoardVisual(scene.visual, band) : scene.visual,
    })),
  } : undefined;
  return {
    ...lesson,
    title: adaptStructure(lesson.title),
    subtitle: adaptTeachingCopy(lesson.subtitle, band),
    blocks,
    annotations,
    visual: adaptLegacyVisual(lesson.visual, band),
    ...(plan ? { plan } : {}),
    returnLabel: adaptTeachingCopy(lesson.returnLabel, band),
  };
}

function adaptOutsideProtected(text: string, protectedValues: Array<string | undefined>, band: GradeBand): string {
  let segments: Array<{ text: string; protected: boolean }> = [{ text, protected: false }];
  for (const value of protectedValues.filter((item): item is string => Boolean(item))) {
    segments = segments.flatMap((segment) => {
      if (segment.protected || !segment.text.includes(value)) return [segment];
      return segment.text.split(value).flatMap((part, index, parts) => index < parts.length - 1
        ? [{ text: part, protected: false }, { text: value, protected: true }]
        : [{ text: part, protected: false }]);
    });
  }
  return segments.map((segment) => segment.protected ? segment.text : adaptTeachingCopy(segment.text, band)).join("");
}

function shortenPrimarySentences(text: string): string {
  return transformOutsideMath(text, (plain) => plain.replace(/[，,]\s*(?=再|然后|接着|最后)/g, "。").split(/([。！？!?.\n])/).map((part) => {
    if ([...part.replace(/\s/g, "")].length <= 64) return part;
    const separator = /[A-Za-z]/.test(part) ? ". " : "。";
    return part.split(/[；;]/).flatMap((clause) => [...clause.replace(/\s/g, "")].length > 64 ? clause.split(/[，,]/).filter(Boolean) : [clause]).join(separator);
  }).join("").replace(/。{2,}/g, "。"));
}

function transformOutsideMath(text: string, transform: (plain: string) => string): string {
  return text.split(/(\$\$[\s\S]*?\$\$|\$[^$]*\$)/g).map((part, index) => index % 2 === 1 ? part : transform(part)).join("");
}

function adaptLegacyVisual<T extends BoardLesson["visual"]>(visual: T, band: GradeBand): T {
  if (!visual) return visual;
  return { ...visual, title: adaptTeachingCopy(visual.title, band), caption: adaptTeachingCopy(visual.caption, band) } as T;
}

function adaptBoardVisual(visual: BoardSemanticVisual, band: GradeBand): BoardSemanticVisual {
  const copy = { title: adaptTeachingCopy(visual.title, band), caption: adaptTeachingCopy(visual.caption, band) };
  if (visual.kind === "concept_graph") return { ...visual, ...copy, nodes: visual.nodes.map((node) => ({ ...node, label: adaptTeachingCopy(node.label, band) })), edges: visual.edges.map((edge) => ({ ...edge, label: edge.label ? adaptTeachingCopy(edge.label, band) : undefined })) };
  if (visual.kind === "formula_chain") return { ...visual, ...copy, steps: visual.steps.map((step) => ({ ...step, explanation: adaptTeachingCopy(step.explanation, band) })) };
  if (visual.kind === "evidence_chain") return { ...visual, ...copy, links: visual.links.map((link) => ({ ...link, meaning: adaptTeachingCopy(link.meaning, band) })) };
  if (visual.kind === "timeline") return { ...visual, ...copy, events: visual.events.map((event) => ({ ...event, event: adaptTeachingCopy(event.event, band) })) };
  if (visual.kind === "process_flow") return { ...visual, ...copy, steps: visual.steps.map((step) => ({ ...step, label: adaptTeachingCopy(step.label, band) })) };
  if (visual.kind === "comparison_matrix") return { ...visual, ...copy, columns: visual.columns.map((column) => adaptTeachingCopy(column, band)) as [string, string], rows: visual.rows.map((row) => ({ ...row, aspect: adaptTeachingCopy(row.aspect, band), left: adaptTeachingCopy(row.left, band), right: adaptTeachingCopy(row.right, band) })) };
  return { ...visual, ...copy };
}
