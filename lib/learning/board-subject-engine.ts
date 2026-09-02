import type { BoardBlock, BoardDisciplineMove, BoardTeachingRole, KnowledgeNode, LearningSession, Subject, TutorScope } from "./types";
import { assertBalancedLearningMarkup } from "./presentation";
import { extractBoardEvidenceClauses, isTaskInstructionText } from "./board-evidence";
import { generatedTextContainsAnswer } from "./providers/answer-protection";
import { createMathBoardBlocks, createMathBoardContent } from "./board-math-content";

export interface SubjectBoardProfile {
  discipline: Subject;
  label: string;
  thesis: string;
  moves: Array<{ id: BoardDisciplineMove; label: string; role: BoardTeachingRole; purpose: string; selfCheck: string }>;
}

const profiles: Record<Subject, SubjectBoardProfile> = {
  math: profile("math", "数学 · 建模与推导", "把条件翻译成关系，在每次变换中保留依据与不变量。", [
    move("frame_relation", "题意成模", "orient", "明确对象、已知和待求", "题目真正要求哪个量或结论？"),
    move("model_objects", "关系结构", "model", "把分散条件放进同一关系", "哪条条件决定这个关系？"),
    move("transform_with_basis", "依据变换", "reason", "逐步变形并写出理由", "这次变形保持了什么不变？"),
    move("verify_invariant", "反查边界", "misconception", "用条件和反例排除误用", "换对象或漏条件后还成立吗？"),
    move("transfer_structure", "迁移骨架", "recap", "提炼可复用的判断顺序", "换数字后先检查哪三件事？"),
  ]),
  physics: profile("physics", "物理 · 系统与规律", "先界定研究系统，再让物理量、方向、单位和规律对应同一过程。", [
    move("define_system", "研究系统", "orient", "确定对象、过程和观察阶段", "研究的是谁、处于哪个过程？"),
    move("inventory_quantities", "量与方向", "model", "列出已知量、待求量及方向", "每个数值属于哪个物理量？"),
    move("select_law", "规律适用", "reason", "用条件选择而非套用规律", "规律的适用条件在题中哪里？"),
    move("check_direction_unit", "量纲校验", "misconception", "检查方向、单位与数量级", "单位和方向能支持当前式子吗？"),
    move("explain_phenomenon", "现象回译", "recap", "把计算关系还原成物理解释", "结果说明系统发生了什么？"),
  ]),
  chemistry: profile("chemistry", "化学 · 反应与守恒", "沿物质身份、反应变化和守恒账本，在宏观现象与粒子尺度之间往返。", [
    move("identify_substances", "物质身份", "orient", "分清反应物、生成物与状态", "题目中有哪些物质和条件？"),
    move("track_reaction", "变化路径", "model", "把反应前后及现象放入过程", "发生了什么可验证的变化？"),
    move("balance_conservation", "守恒账本", "reason", "逐项核对元素、粒子或质量", "变化前后哪一项必须守恒？"),
    move("connect_conditions", "条件边界", "misconception", "区分条件、现象与结论", "改变条件后结论仍成立吗？"),
    move("shift_particle_scale", "微粒解释", "recap", "用粒子重组解释宏观变化", "宏观现象对应怎样的粒子变化？"),
  ]),
  biology: profile("biology", "生物 · 结构与生命过程", "从生命层次定位对象，连接结构、功能、过程与可控变量。", [
    move("locate_structure", "生命层次", "orient", "定位结构层次和研究对象", "对象处于细胞、器官还是系统层次？"),
    move("connect_function", "结构—功能", "model", "解释结构如何支持功能", "哪个结构特征支撑该功能？"),
    move("trace_life_process", "过程链", "reason", "追踪物质、能量或信息变化", "过程的输入、变化和输出是什么？"),
    move("control_variables", "变量与对照", "misconception", "分清自变量、因变量和控制量", "除研究因素外哪些条件必须一致？"),
    move("explain_regulation", "调节闭环", "recap", "用反馈解释稳态或适应", "变化怎样被检测并得到调节？"),
  ]),
  chinese: profile("chinese", "语文 · 原文证据与表达", "从原文定位出发，解释词句怎样在语境、结构与主旨中产生作用。", [
    move("locate_text", "原文定位", "orient", "找到直接支撑回答的原句", "哪一句原文最能支撑判断？"),
    move("analyze_language", "词句解剖", "model", "识别用词、句式或表达手法", "关键表达具体写了什么对象？"),
    move("explain_effect", "语境作用", "reason", "说明表达怎样产生具体效果", "去掉或替换这处表达会损失什么？"),
    move("connect_structure_theme", "结构主旨", "misconception", "把局部作用放回全文位置", "它和前后文、主旨怎样连接？"),
    move("land_answer", "答案落点", "recap", "组织证据、分析与回扣", "每个结论都有原文依据吗？"),
  ]),
  english: profile("english", "英语 · Evidence and Language", "Move from exact textual evidence to sentence roles, discourse relations and meaning in context.", [
    move("locate_evidence", "Text evidence", "orient", "Locate the exact supporting words", "Which exact words support the answer?"),
    move("parse_sentence", "Sentence roles", "model", "Mark subject, predicate, object and clauses", "What role does each phrase play?"),
    move("trace_discourse", "Discourse link", "reason", "Trace connectors, reference and tense", "How does this sentence connect to the previous one?"),
    move("infer_in_context", "Meaning in context", "misconception", "Infer only within the evidence boundary", "Is the inference stated or merely guessed?"),
    move("frame_english_answer", "Answer frame", "recap", "Combine evidence and explanation in English", "Does the answer quote and explain the evidence?"),
  ]),
  history: profile("history", "历史 · 时空、史料与因果", "把材料放入时空坐标，区分史料事实与解释，再建立有证据的因果和评价。", [
    move("locate_time_space", "时空坐标", "orient", "定位时间、区域与历史阶段", "事件发生在什么时空背景？"),
    move("extract_historical_fact", "史料事实", "model", "提取材料明确陈述的事实", "哪些是材料事实而非自己的判断？"),
    move("build_cause_effect", "因果链", "reason", "区分背景、条件、事件与影响", "哪条事实支持这项因果判断？"),
    move("evaluate_impact", "影响评价", "misconception", "限定主体、范围与时间尺度", "评价对谁、在什么范围内成立？"),
    move("compare_history", "比较迁移", "recap", "按同一维度比较异同", "比较项是否使用了相同尺度？"),
  ]),
  geography: profile("geography", "地理 · 区域与过程机制", "从区域和尺度定位出发，连接自然与人文要素，解释空间格局形成过程。", [
    move("locate_region", "区域定位", "orient", "读清位置、尺度、图例与方向", "研究区域在哪里、尺度多大？"),
    move("extract_geo_factors", "要素清单", "model", "提取自然与人文地理要素", "题目明确给了哪些区域要素？"),
    move("connect_space", "空间联系", "reason", "连接分布、流动和区位关系", "这些要素在空间上怎样相互作用？"),
    move("explain_geo_process", "形成过程", "misconception", "沿时间或空间过程解释机制", "只是相关，还是有过程证据？"),
    move("evaluate_human_land", "人地影响", "recap", "分析影响与尺度边界", "结论在哪个区域和尺度内有效？"),
  ]),
  politics: profile("politics", "政治 · 材料与规范论证", "先读设问动作，再把材料分层、匹配概念并形成有依据的规范论证。", [
    move("read_question_direction", "设问方向", "orient", "确定知识范围和作答动作", "题目要求原因、意义、体现还是措施？"),
    move("layer_material", "材料分层", "model", "按主体、行为和结果提取信息", "材料可以分成哪几层意思？"),
    move("match_concept", "概念匹配", "reason", "让每个观点对应材料证据", "概念能解释材料中的哪个动作？"),
    move("build_argument", "论证链", "misconception", "连接材料、观点与结论", "删掉材料后这项结论还能成立吗？"),
    move("normalize_expression", "规范表达", "recap", "按设问组织分点答案", "每一点是否同时含材料和观点？"),
  ]),
};

const biologyExperimentProfile = profile("biology", "生物 · 实验与证据", "把研究问题转成可控制、可观察、可比较的实验设计，再限定结论边界。", [
  move("define_research_question", "研究问题", "orient", "明确研究对象与单一问题", "实验究竟要判断哪个因素的影响？"),
  move("identify_variables", "变量表", "model", "区分自变量、因变量和控制变量", "改变什么、观察什么、保持什么？"),
  move("design_control", "对照设计", "reason", "建立唯一差异的可比组", "两组之间是否只差研究因素？"),
  move("read_experiment_evidence", "观察证据", "misconception", "区分观察记录与原因解释", "哪些是测得结果，哪些只是推测？"),
  move("limit_experiment_conclusion", "结论边界", "recap", "让结论只覆盖实验支持的范围", "结论是否超出了对象、条件或指标？"),
]);

const biologyGeneticsProfile = profile("biology", "生物 · 遗传组合与概率", "先统一性状和基因口径，再用亲本配子与组合过程解释后代比例。", [
  move("identify_trait", "性状口径", "orient", "明确相对性状与显隐性关系", "研究的是哪一对相对性状？"),
  move("represent_genotype", "基因表示", "model", "用统一符号表示基因型和表现型", "每个符号对应什么基因与性状？"),
  move("build_cross", "组合过程", "reason", "从亲本基因型推出配子与后代组合", "每个后代组合来自哪两个配子？"),
  move("compare_probability", "概率边界", "misconception", "区分理论概率、样本比例和必然结果", "概率是否被误写成每次必然发生？"),
  move("verify_genetic_explanation", "遗传复核", "recap", "用基因型、表现型和比例共同复核", "结论能同时解释组合与表现吗？"),
]);

const biologyLinkageProfile = profile("biology", "生物 · 遗传方式验证", "把基因位置假设转成正反交对照，按后代性别和性状差异判断遗传方式。", [
  move("state_linkage_hypothesis", "位置假设", "orient", "明确待验证的基因位置与替代假设", "要区分常染色体还是性染色体遗传？"),
  move("design_reciprocal_cross", "正反交设计", "model", "交换雌雄亲本性状建立正交与反交", "两组杂交是否只交换了亲本性别？"),
  move("group_offspring_by_sex", "后代分组", "reason", "按后代性别和表现型分别记录结果", "是否把雌雄后代混在同一比例中？"),
  move("compare_cross_outcomes", "结果对照", "misconception", "比较正反交后代分布是否随亲本性别改变", "两组差异能否由伴性遗传解释？"),
  move("infer_linkage_boundary", "结论边界", "recap", "用正反交差异判断位置并限定证据范围", "结论是否超出当前杂交结果？"),
]);

const biologyExpressionProfile = profile("biology", "生物 · 遗传信息表达", "沿基因到 RNA、蛋白质和性状的方向追踪信息，区分转录、翻译的场所、模板与产物。", [
  move("locate_genetic_information", "信息起点", "orient", "明确基因、遗传信息与表达目标", "信息从哪种分子出发，最终形成什么？"),
  move("model_transcription", "转录过程", "model", "建立 DNA 模板到 RNA 产物的对应关系", "转录使用什么模板并产生什么？"),
  move("model_translation", "翻译过程", "reason", "连接密码子、翻译场所与氨基酸序列", "翻译场所读取什么，产物是什么？"),
  move("connect_protein_trait", "蛋白质到性状", "misconception", "解释蛋白质功能怎样影响性状", "基因是否直接变成性状？"),
  move("verify_expression_chain", "表达链复核", "recap", "按方向、场所、模板和产物复核整条链", "每一步的信息方向与产物都对应吗？"),
]);

const englishGrammarProfile = profile("english", "英语 · Grammar in Context", "Read the clause structure, locate the grammar signal, apply one rule, and verify meaning in context.", [
  move("parse_clause_structure", "Clause structure", "orient", "Parse the clause and locate the missing language role", "What role does the blank play in the clause?"),
  move("identify_grammar_signal", "Grammar signal", "model", "Identify the exact time, connector or agreement signal", "Which word controls the grammar choice?"),
  move("apply_grammar_rule", "Rule in context", "reason", "Apply the rule to this sentence rather than reciting it", "How does the signal determine the form?"),
  move("check_grammar_boundary", "Boundary check", "misconception", "Test exceptions, clause type and intended meaning", "Would another form change the time or logic?"),
  move("verify_grammar_choice", "Verify choice", "recap", "Read the completed sentence for grammar and meaning", "Is the sentence both grammatical and meaningful?"),
]);

const physicsOpticsProfile = profile("physics", "物理 · 光路与成像", "先界定介质与界面，再沿光线传播方向应用光学规律解释观察现象。", [
  move("define_optical_system", "光学系统", "orient", "明确光源、介质、界面和观察者", "光从哪里出发，经过哪些介质？"),
  move("trace_light_path", "光路追踪", "model", "沿传播方向标出入射光、法线和出射光", "每段光线在哪个界面改变方向？"),
  move("apply_optical_rule", "规律应用", "reason", "依据反射或折射条件判断方向变化", "使用的是哪条光学规律？"),
  move("check_optical_boundary", "边界辨析", "misconception", "区分角度基准、真实光线和视觉判断", "判断是否始终使用同一角度基准？"),
  move("explain_optical_observation", "现象回译", "recap", "用完整光路解释方向或观察现象", "每一段光路都能支持当前结论吗？"),
]);

const physicsPinholeProfile = profile("physics", "物理 · 小孔成像", "用光的直线传播追踪物点经小孔到光屏的对应关系，再用几何比例判断像的变化。", [
  move("set_pinhole_system", "装置与对象", "orient", "明确物体、小孔和光屏的相对位置", "物体、小孔、光屏按什么顺序排列？"),
  move("trace_straight_rays", "直线光路", "model", "从物体特征点追踪穿过小孔的光线", "上下特征点的光线穿孔后到哪里？"),
  move("model_pinhole_ratio", "比例模型", "reason", "用相似三角形连接物距、像距与像高", "像高由哪两个距离的比值控制？"),
  move("distinguish_pinhole_image", "成像性质", "misconception", "区分光屏可承接与反向延长形成的两类像", "光线是否真的到达像的位置？"),
  move("verify_pinhole_change", "变化复核", "recap", "改变一个距离后复核像的位置与大小变化", "只改变一个距离时比例怎样改变？"),
]);

const physicsLensProfile = profile("physics", "物理 · 透镜成像", "先把物距放入成像分区，再用主光线交点判断像的位置、实虚、正倒与大小。", [
  move("locate_lens_zones", "成像分区", "orient", "标出透镜、光心和关键距离位置", "物体位于哪个成像区间？"),
  move("trace_principal_rays", "主光线", "model", "选择平行光线与过光心光线作图", "两条主光线经过透镜后怎样传播？"),
  move("judge_ray_intersection", "交点判断", "reason", "由实际光线或反向延长线的交点定位像", "交点来自真实光线还是反向延长线？"),
  move("classify_lens_image", "像的四要素", "misconception", "分别判断位置、实虚、正倒和大小", "是否把四个性质混成一个结论？"),
  move("verify_lens_image", "光屏复核", "recap", "用光屏承接与主光线方向复核成像性质", "当前像能否在光屏上清晰承接？"),
]);

const chemistryClassificationProfile = profile("chemistry", "化学 · 物质分类与依据", "先明确分类对象和唯一标准，再逐项用组成或性质证据判断，避免把名称相近当成同类。", [
  move("set_classification_target", "分类对象", "orient", "明确待分类的物质与问题口径", "题目要求按什么层级分类？"),
  move("extract_classification_basis", "分类依据", "model", "提取组成或性质这一条判断标准", "每个对象使用的是同一标准吗？"),
  move("apply_classification_rule", "逐项归类", "reason", "让每个判断都对应一条题目证据", "这个类别由哪项组成或性质决定？"),
  move("check_classification_boundary", "边界辨析", "misconception", "排除名称、状态和俗称造成的误判", "改变状态后物质类别会改变吗？"),
  move("transfer_classification", "分类迁移", "recap", "保留分类标准并迁移到新对象", "换一组物质时先检查哪条依据？"),
]);

const chemistryReactionTypeProfile = profile("chemistry", "化学 · 反应类型判断", "把反应式两侧按物质种类计数，再用反应物与生成物的结构模式判断基本反应类型。", [
  move("count_reaction_sides", "两侧计数", "orient", "分别统计反应物与生成物的物质种类", "箭头两侧各有几种物质？"),
  move("model_reaction_structure", "结构骨架", "model", "把化学方程式压成多与一的结构关系", "当前结构是多变一、一变多还是多变多？"),
  move("classify_reaction_pattern", "类型判定", "reason", "用两侧物质种类的变化匹配反应类型", "类型名称对应哪一种结构模式？"),
  move("separate_reaction_concepts", "概念边界", "misconception", "区分反应类型、物质类别与是否配平", "系数变化会改变物质种类数吗？"),
  move("verify_reaction_type", "方程式复核", "recap", "回到完整方程式复核物质身份和结构", "每一种物质是否被完整计数且没有漏项？"),
]);

const englishVocabularyProfile = profile("english", "英语 · Word in Context", "Use local grammar and surrounding evidence to determine a word or phrase meaning without dictionary-style guessing.", [
  move("locate_word_evidence", "Word evidence", "orient", "Locate the target word and nearby evidence", "Which exact words form the local context?"),
  move("inspect_local_grammar", "Local grammar", "model", "Identify the word form and sentence role", "What part of speech and role does it have here?"),
  move("combine_context_clues", "Context clues", "reason", "Combine contrast, example and reference clues", "Which clue narrows the meaning most?"),
  move("limit_word_meaning", "Meaning boundary", "misconception", "Reject meanings that conflict with the sentence", "Does this meaning fit both grammar and context?"),
  move("answer_word_in_context", "Answer in context", "recap", "State the contextual meaning with evidence", "Can the meaning be explained from this sentence?"),
]);

export function subjectBoardProfile(subject: Subject): SubjectBoardProfile { return profiles[subject]; }

export function subjectBoardProfileByMove(subject: Subject, firstMove?: BoardDisciplineMove): SubjectBoardProfile {
  return [biologyExperimentProfile, biologyExpressionProfile, biologyGeneticsProfile, biologyLinkageProfile, chemistryClassificationProfile, chemistryReactionTypeProfile, englishVocabularyProfile, englishGrammarProfile, physicsPinholeProfile, physicsLensProfile, physicsOpticsProfile, profiles[subject]]
    .find((candidate) => candidate.discipline === subject && candidate.moves[0]?.id === firstMove) ?? profiles[subject];
}

export function allSubjectBoardMoves(): BoardDisciplineMove[] {
  return Array.from(new Set([...Object.values(profiles), biologyExperimentProfile, biologyExpressionProfile, biologyGeneticsProfile, biologyLinkageProfile, chemistryClassificationProfile, chemistryReactionTypeProfile, englishVocabularyProfile, englishGrammarProfile, physicsPinholeProfile, physicsLensProfile, physicsOpticsProfile].flatMap((item) => item.moves.map((move) => move.id))));
}

export function subjectBoardProfileFor(session: LearningSession): SubjectBoardProfile {
  const problemText = session.problem.text;
  const taskText = session.problemGuide.goal;
  const text = `${problemText} ${taskText}`;
  const biologyExperimentTask = /(?:设计实验|探究|变量|对照|实验组|control group|experiment)/i.test(text);
  const biologyExpressionTask = /(?:转录|翻译|蛋白质合成|基因表达|遗传信息表达|中心法则|mRNA|tRNA|密码子|核糖体|DNA.{0,16}RNA.{0,16}蛋白质|基因.{0,10}控制.{0,10}性状)/i.test(text);
  if (session.problem.subject === "biology" && biologyExperimentTask && biologyExpressionTask) return biologyExperimentProfile;
  if (session.problem.subject === "biology" && biologyExpressionTask) return biologyExpressionProfile;
  if (session.problem.subject === "biology" && /(?:X染色体|Y染色体|性染色体|伴性|正交|反交|性别.{0,8}遗传|遗传.{0,8}性别|果蝇.{0,8}眼色)/i.test(text)) return biologyLinkageProfile;
  if (session.problem.subject === "biology" && biologyExperimentTask) return biologyExperimentProfile;
  if (session.problem.subject === "biology" && /(?:亲本|杂交|后代|配子|性状分离|显性.{0,10}隐性|基因型.{0,12}(?:比例|组合)|表现型.{0,12}(?:比例|组合)|遗传比例)/i.test(text)) return biologyGeneticsProfile;
  const reactionTypeTask = /(?:化合反应|分解反应|置换反应|复分解反应|反应类型)/.test(text);
  const reactionProcessTask = /(?:燃烧|配平|化学方程式|质量守恒|元素守恒|生成\s*[A-Za-z\p{Script=Han}])/u.test(text);
  const substanceClassificationTask = /(?:物质分类|混合物|纯净物|单质|化合物|元素类别|按(?:物质)?组成.{0,8}(?:判断|归类|分类)|(?:物质|反应物|生成物).{0,12}(?:分别属于|属于哪类|属于.{0,6}(?:单质|化合物)))/.test(text);
  const explicitClassificationIntent = /(?:分别)?属于.{0,10}(?:混合物|纯净物|单质|化合物)|(?:判断|区分|辨别|归类|分类).{0,12}(?:物质类别|所属类别)|按(?:物质)?组成.{0,8}(?:判断|归类|分类)|(?:混合物|纯净物|单质|化合物).{0,8}(?:还是|或).{0,8}(?:混合物|纯净物|单质|化合物)/.test(`${taskText} ${problemText}`);
  if (session.problem.subject === "chemistry" && reactionTypeTask) return chemistryReactionTypeProfile;
  if (session.problem.subject === "chemistry" && substanceClassificationTask && (explicitClassificationIntent || !reactionProcessTask)) return chemistryClassificationProfile;
  const vocabularyTask = /(?:词义|单词|短语含义|word meaning|meaning of (?:the )?(?:word|phrase)|what does .{1,36} mean|vocabulary)/i.test(text);
  if (session.problem.subject === "english" && vocabularyTask) return englishVocabularyProfile;
  const readingEvidenceTask = /(?:find|locate|quote|cite).{0,24}(?:textual|text|passage|sentence)?\s*evidence|(?:what|which)\s+evidence|evidence\s+(?:supports?|shows?|explains?)|(?:use|using)\s+(?:details|evidence)\s+from\s+(?:the\s+)?(?:passage|text)|details\s+from\s+(?:the\s+)?(?:passage|text)|(?:textual|passage)\s+evidence|(?:according to|based on)\s+(?:the\s+)?(?:passage|text)/i.test(`${taskText} ${problemText}`);
  if (session.problem.subject === "english" && readingEvidenceTask) return profiles.english;
  const grammarTask = /(?:条件句|语法填空|时态|虚拟语气|语法|grammar|grammatical|agreement|(?:present|past|future)?\s*tense|correct (?:verb|sentence)|verb form)/i.test(taskText)
    || /(?:_{2,}|\([^()]{1,24}\/[^()]{1,24}\)|choose the correct (?:verb|sentence|form))/i.test(problemText);
  if (session.problem.subject === "english" && grammarTask) return englishGrammarProfile;
  if (session.problem.subject === "physics" && /(?:小孔成像|针孔成像)/i.test(text)) return physicsPinholeProfile;
  if (session.problem.subject === "physics" && /(?:凸透镜|凹透镜|透镜成像|放大镜|投影仪|幻灯机|照相机.{0,8}(?:镜头|成像|底片)|物距.{0,8}(?:焦距|2f|二倍焦距))/i.test(text)) return physicsLensProfile;
  if (session.problem.subject === "physics" && /(?:折射|反射|透镜|光线|入射角|折射角|光路|成像|像的位置)/i.test(text)) return physicsOpticsProfile;
  return profiles[session.problem.subject];
}

export function createSubjectNativeBlocks(session: LearningSession, scope: TutorScope): BoardBlock[] {
  const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
  const selected = subjectBoardProfileFor(session);
  const context = boardContext(session, selected, node);
  const mathContent = session.problem.subject === "math" ? createMathBoardContent(session.problem.text) : null;
  if (mathContent) return createMathBoardBlocks(mathContent);
  const generated = selected === biologyExperimentProfile ? biologyExperimentBlocks(context)
    : selected === biologyExpressionProfile ? biologyExpressionBlocks(context)
      : selected === biologyGeneticsProfile ? biologyGeneticsBlocks(context)
      : selected === biologyLinkageProfile ? biologyLinkageBlocks(context)
      : selected === chemistryClassificationProfile ? chemistryClassificationBlocks(context)
        : selected === chemistryReactionTypeProfile ? chemistryReactionTypeBlocks(context)
        : selected === englishVocabularyProfile ? englishVocabularyBlocks(context)
          : selected === englishGrammarProfile ? englishGrammarBlocks(context)
            : selected === physicsPinholeProfile ? physicsPinholeBlocks(context)
              : selected === physicsLensProfile ? physicsLensBlocks(context)
                : selected === physicsOpticsProfile ? physicsOpticsBlocks(context)
        : composers[session.problem.subject](context);
  return generated.map((block, index) => {
    const sceneEvidence = context.evidences.length ? context.evidences[index % context.evidences.length] : "";
    const withPurpose = block.content.includes(selected.moves[index].purpose) ? block.content : `${selected.moves[index].purpose}。${block.content}`;
    return { ...block, content: !sceneEvidence || withPurpose.includes(sceneEvidence) ? withPurpose : `${selected.moves[index].purpose}。原题依据：“${sceneEvidence}”。${block.content}` };
  });
}

type BoardContext = { task: string; clue: string; approach: string; question: string; focus: string; evidence: string; evidences: string[]; source: string; answer: string };
type Composer = (context: BoardContext) => BoardBlock[];

const composers: Record<Subject, Composer> = {
  math: (c) => blocks(["题意成模", `先把任务写成“对象—已知—待求”：${c.task} 当前只锁定“${c.focus}”，不提前代入最终结果。`], ["关系结构", `${c.clue} 把明确条件放到同一式子、图形或数量关系中，标清对应对象与限制。`], ["依据变换", `${c.approach} 每推进一步，都写清使用的性质、定义或等价变换，不能跳过中间关系。`], ["反查边界", "交换对象、忽略单位、漏掉定义域或把图形外观当条件，都会让同样的式子失效；用原条件逐项反查。"], ["迁移骨架", `${c.question} 换数字后仍按“定对象—建关系—写依据—验边界”重建，不背本题表面步骤。`]),
  physics: (c) => blocks(["研究系统", `${c.task} 先圈定研究对象、相互作用和观察阶段，避免把别的物体或过程量混入。`], ["量与方向", `${c.clue} 将题中每个数值写成“物理量=数值+单位”，方向量另标正方向。`], ["规律适用", `${c.approach} 先核对规律的系统、状态和过程条件，再列关系式，不凭关键词套公式。`], ["量纲校验", "关系式两边的量纲必须一致；方向、正负号和数量级要能回到题设现象，任何一项不合都说明对象或公式选错。"], ["现象回译", `${c.question} 最后不用公式复述：这个关系说明研究系统发生了怎样的物理变化。`]),
  chemistry: (c) => blocks(["物质身份", `${c.task} 先列反应物、生成物、状态和题目明确给出的条件，化学式与名称一一对应。`], ["变化路径", `${c.clue} 将反应前、反应中条件和可观察现象按顺序排列，区分现象与解释。`], ["守恒账本", `${c.approach} 分别核对元素、原子或质量在变化前后是否对应，只修改允许变化的系数或数量。`], ["条件边界", "反应条件、物质状态或过量关系改变时，现象和产物可能变化；没有题干证据就不补写新的物质或结论。"], ["微粒解释", `${c.question} 用“粒子保留—重新组合—形成新物质”解释宏观变化，并回查守恒账本。`]),
  biology: (c) => blocks(["生命层次", `${c.task} 先确认研究对象处于细胞、组织、器官、系统还是生态层次，避免跨层次直接下结论。`], ["结构—功能", `${c.clue} 提取结构特征，并逐项说明它怎样支持题目所指的功能，不只罗列名称。`], ["过程链", `${c.approach} 沿输入、发生部位、关键变化和输出追踪物质、能量或信息。`], ["变量与对照", "实验结论必须对应唯一自变量；因变量要可观察，其余条件保持一致，没有对照就不能确认差异来自研究因素。"], ["调节闭环", `${c.question} 若涉及稳态，继续找“变化—感受—调节—结果—反馈”的闭环；题干未给的机制不自行补充。`]),
  chinese: (c) => blocks(["原文定位", `${c.task} ${c.evidence ? `先回到原文，保留能直接支撑设问的完整词句：“${c.evidence}”。` : "当前题目没有提供可引用原文，先补充原句后再分析。"}`], ["词句解剖", `${c.clue} 识别具体用词、句式、修辞或叙述视角，并说明它写的是谁、什么状态或动作。`], ["语境作用", `${c.approach} 用“语言现象—具体画面/语气—读者感受”解释，不能只写“生动形象”。`], ["结构主旨", "把这处表达放回段落和全文位置，检查它是否铺垫、转折、照应或推进主旨；没有上下文依据就不套结构术语。"], ["答案落点", `${c.question} 最终按“原文证据—具体分析—回扣设问”组织，每个判断都能指回原句。`]),
  english: (c) => blocks(["Text evidence", c.evidence ? `Keep the exact words that support the task: “${c.evidence}”. Do not answer from memory alone.` : "The task includes no passage evidence yet. Add the source sentence before making a textual inference."], ["Sentence roles", `${c.clue} Mark the subject, predicate, object, clauses and connector before interpreting the sentence.`], ["Discourse link", `${c.approach} Trace reference, tense and logical connectors to see how this sentence continues, contrasts or explains the context.`], ["Meaning in context", "Separate what the text states from what it only suggests. An inference is valid only when exact words and the discourse relation support it."], ["Answer frame", `${c.question} Build the response as “evidence — language relation — meaning in context”, not as a detached grammar label.`]),
  history: (c) => blocks(["时空坐标", `${c.task} 先把材料放入时间、区域和历史阶段，避免把不同时期的制度或人物混用。`], ["史料事实", `${c.evidence ? `逐字保留材料事实：“${c.evidence}”。` : "当前题目没有提供史料事实，先补充材料后再判断。"}${c.clue} 先区分材料说了什么和我们怎样解释。`], ["因果链", `${c.approach} 按“背景条件—行动/事件—直接变化—后续影响”组织，每一箭头都要有材料依据。`], ["影响评价", "评价必须限定主体、区域与时间尺度；时间先后不自动构成因果，材料未覆盖的长期影响不自行补写。"], ["比较迁移", `${c.question} 比较另一事件时统一维度：背景对背景、措施对措施、影响对影响。`]),
  geography: (c) => blocks(["区域定位", `${c.task} 先读区域位置、尺度、图例和方向；同一结论在不同空间尺度下可能不同。`], ["要素清单", `${c.clue} 分开列自然要素与人文要素，只采用图文材料明确给出的信息。`], ["空间联系", `${c.approach} 用流动、分布、区位或上下游关系连接要素，不把同时出现直接当成因果。`], ["形成过程", "沿时间或空间顺序解释“条件怎样作用—中间发生什么—形成什么格局”，缺少中间过程就保留结论边界。"], ["人地影响", `${c.question} 最后分别检查对自然环境、生产生活和区域发展的影响及适用尺度。`]),
  politics: (c) => blocks(["设问方向", `${c.task} 先圈出设问动词与知识范围，原因、意义、体现和措施使用不同论证动作。`], ["材料分层", c.evidence ? `将材料按主体、行为、条件和结果分层，保留原文依据：“${c.evidence}”。` : "当前题目没有提供材料事实，先补充材料再分层。"], ["概念匹配", `${c.clue} 每个概念只解释一条材料信息，并写清两者为什么对应，不能只堆教材术语。`], ["论证链", `${c.approach} 用“材料事实—对应观点—由此得出的结论”推进；删掉材料就无法成立的空话应移除。`], ["规范表达", `${c.question} 按设问逐点作答，同层级、同口径，不把原因、影响和建议混在一个分点里。`]),
};

function biologyExperimentBlocks(c: BoardContext): BoardBlock[] {
  return blocks(
    ["研究问题", `${c.task} 先把问题压成“某一因素是否影响某个可观察指标”，明确研究对象，不同时研究多个变化。`],
    ["变量表", `${c.clue} 分成自变量、因变量和控制变量；每个条件只放进一种角色，避免把观察结果写成控制条件。`],
    ["对照设计", `${c.approach} 设置实验组与对照组，两组只改变研究因素，其余对象、时间、环境和测量方式保持一致。`],
    ["观察证据", `逐次记录可测结果并比较组间差异；“看到什么”与“为什么会这样”分开，单次偶然现象不能直接当成规律。`],
    ["结论边界", `${c.question} 结论只说明当前对象、条件和指标下的影响；没有重复、对照或稳定差异时，应保留判断而不是补写机制。`],
  );
}

function chemistryClassificationBlocks(c: BoardContext): BoardBlock[] {
  return blocks(
    ["分类对象", `${c.task} 先逐项写出题目要求判断的对象，明确是在区分混合物、纯净物，还是继续区分单质与化合物。`],
    ["分类依据", `${c.clue} 当前只使用组成是否单一、是否由同一种物质构成等题目可核对依据，不能拿颜色、状态或名称长短代替标准。`],
    ["逐项归类", `${c.approach} 对每个对象分别写成“原题信息—采用标准—所属类别”，每一项独立判断，不用前一个对象的结论替代证据。`],
    ["边界辨析", "物质的状态、用途和俗称不能直接决定类别；同名混合物也可能组成不同，题目没有给出组成时应保留判断。"],
    ["分类迁移", `${c.question} 换一组物质后仍先确定分类层级，再用同一组成标准逐项判断，最后反查是否混用了不同口径。`],
  );
}

function chemistryReactionTypeBlocks(c: BoardContext): BoardBlock[] {
  return blocks(
    ["两侧计数", `${c.task} 先按箭头分开反应物和生成物，只统计不同物质的种类，不把化学计量系数重复算成多种物质。`],
    ["结构骨架", `${c.clue} 把完整方程式压成“多种物质 → 一种物质”“一种物质 → 多种物质”或“多种 → 多种”的骨架。`],
    ["类型判定", `${c.approach} 多种反应物生成一种物质是化合反应，一种反应物生成多种物质是分解反应；“单质+化合物→新单质+新化合物”是置换反应，“两种化合物交换成分→两种新化合物”是复分解反应。`],
    ["概念边界", "遇到“多种→多种”必须继续核对物质身份：置换反应有单质参与并生成新单质，复分解反应则是两种化合物相互交换成分；方程式系数不改变反应类型。"],
    ["方程式复核", `${c.question} 回到箭头两侧逐项点数，确认没有把同一物质的系数、状态符号或反应条件误当成新的物质。`],
  );
}

function englishVocabularyBlocks(c: BoardContext): BoardBlock[] {
  return blocks(
    ["Word evidence", `Locate the target word or phrase and keep its local sentence: “${c.evidence}”. The answer must stay inside this context.`],
    ["Local grammar", `${c.clue} Identify its word form, modifier and sentence role before choosing a meaning.`],
    ["Context clues", `${c.approach} Combine contrast, example, cause, reference and tone clues; one familiar translation is not enough.`],
    ["Meaning boundary", "Replace the word with each candidate meaning. Reject any option that breaks the grammar, logic or tone of the sentence."],
    ["Answer in context", `${c.question} State the contextual meaning, quote the decisive clue and explain why it fits this sentence.`],
  );
}

function biologyGeneticsBlocks(c: BoardContext): BoardBlock[] {
  return blocks(["性状口径", `${c.task} 先圈定同一生物的相对性状，并从题干确认显性与隐性关系。`], ["基因表示", `${c.clue} 用同一对字母分别表示显性、隐性基因，把基因型与表现型分开记录。`], ["组合过程", `${c.approach} 先由亲本基因型列出配子，再逐格组合后代基因型，不能从表现型直接猜比例。`], ["概率边界", "理论比例描述大量重复情况下的可能性，不表示一个家庭或一次杂交必然按比例出现。"], ["遗传复核", `${c.question} 逐项核对亲本—配子—后代基因型—表现型，比例必须由实际组合数得到。`]);
}

function biologyLinkageBlocks(c: BoardContext): BoardBlock[] {
  return blocks(["位置假设", `${c.task} 先写出“基因位于性染色体”和“基因位于常染色体”两种可区分假设。`], ["正反交设计", `${c.clue} 分别用目标性状的雌性与另一性状雄性交配，再交换雌雄亲本性状完成反交。`], ["后代分组", `${c.approach} 每组后代都按雌雄和表现型分别计数，不能只看合计比例。`], ["结果对照", "比较正交与反交：若后代性状分布随亲本性别改变，才形成支持伴性遗传的关键差异。"], ["结论边界", `${c.question} 先由两组差异排除替代假设，再把结论限定为当前基因与当前杂交材料。`]);
}

function biologyExpressionBlocks(c: BoardContext): BoardBlock[] {
  const translationSite = currentAnswerIs(c, "核糖体") ? "蛋白质合成场所" : "核糖体";
  return blocks(
    ["信息起点", `${c.task} 先把基因看作携带遗传信息的 DNA 片段，表达目标是形成具有特定结构和功能的蛋白质，而不是把基因直接变成性状。`],
    ["转录过程", `${c.clue} 以 DNA 的一条链为模板，按碱基互补关系合成 RNA；真核细胞中这一步主要在细胞核完成，产物携带可供读取的信息。`],
    ["翻译过程", `${c.approach} mRNA 到达${translationSite}后，密码子依次被读取，tRNA 携带相应氨基酸参与连接，形成具有特定顺序的多肽链。`],
    ["蛋白质到性状", "蛋白质通过催化、运输或构成细胞结构等功能影响生命活动，进而影响性状；不能把 DNA、RNA、蛋白质和性状写成同一种物质。"],
    ["表达链复核", `${c.question} 最后按“基因中的 DNA 信息 → 转录形成 RNA → ${translationSite}完成翻译并形成蛋白质 → 蛋白质功能影响性状”复核方向、场所和产物。`],
  );
}

function englishGrammarBlocks(c: BoardContext): BoardBlock[] {
  return blocks(["Clause structure", `${c.task} First locate the subject, verb, clause boundary and the role of the blank.`], ["Grammar signal", `${c.clue} Mark the exact tense, connector, agreement or condition signal that controls the form.`], ["Rule in context", `${c.approach} Apply one grammar rule to this clause and explain how the signal determines the form.`], ["Boundary check", "Check the clause type, time reference and intended meaning; a familiar form is invalid if it changes the logic."], ["Verify choice", `${c.question} Read the completed sentence aloud and verify both grammatical form and contextual meaning.`]);
}

function physicsPinholeBlocks(c: BoardContext): BoardBlock[] {
  return blocks(
    ["装置与对象", `${c.task} 先按“发光或反光物体—小孔—光屏”排好装置，物距与像距都以小孔所在平面为基准。`],
    ["直线光路", `${c.clue} 从物体上、下两个特征点各画一条穿过小孔的直线，光线穿孔后继续直线传播并到达光屏。`],
    ["比例模型", `${c.approach} 小孔两侧形成相似三角形，可用 $\\frac{h'}{h}=\\frac{v}{u}$ 判断大小变化，其中 $h'$、$h$ 分别表示像高和物高，先比较像距 $v$ 与物距 $u$ 再判断比例。`],
    ["成像性质", currentAnswerIs(c, "实像") || currentAnswerIs(c, "虚像") ? "先检查光线是否真实到达光屏、像能否被光屏承接，再根据上下特征点光线是否交叉判断正倒；不要用名称直接猜性质。" : "光线真实到达光屏形成实像，上下特征点的光线交叉使像倒立；它不是镜后反向延长线形成的虚像。"],
    ["变化复核", `${c.question} 只改变一个距离后，重新画两条边界光线并核对相似三角形比例，不能凭“更近看起来更大”直接猜。`],
  );
}

function physicsLensBlocks(c: BoardContext): BoardBlock[] {
  const lens = /凹透镜/.test(`${c.source} ${c.task} ${c.evidence}`) ? "凹透镜" : "凸透镜";
  const focusTerm = currentAnswerIs(c, "焦点") ? "标记为 F 的特征位置" : "焦点";
  const hideImageType = currentAnswerIs(c, "实像") || currentAnswerIs(c, "虚像");
  const rayRule = lens === "凹透镜"
    ? `平行主轴的光线经透镜后发散，其反向延长线通过同侧${focusTerm}；过光心的光线近似不偏折。`
    : `平行主轴的光线经透镜后通过异侧${focusTerm}；过光心的光线近似不偏折。`;
  return blocks(
    ["成像分区", `${c.task} 先标出${lens}、光心、两侧${focusTerm}与二倍特征距离位置，再把题给物距放进对应区间。`],
    ["主光线", `${c.clue} ${rayRule}`],
    ["交点判断", hideImageType ? `${c.approach} 先判断两条实际折射光线是否真正相交；若不相交，再用反向延长线寻找观察到的位置，并据此判断能否被光屏承接。` : `${c.approach} 两条实际折射光线的交点对应实像；若实际光线不相交，则用反向延长线的交点判断虚像位置。`],
    ["像的四要素", "先由交点所在侧判断位置和实虚，再由像相对主轴的方向判断正倒，最后比较像高与物高判断放大、等大或缩小。"],
    ["光屏复核", hideImageType ? `${c.question} 用光屏能否清晰承接来复核成像性质，再用物距区间与两条主光线复画一次，避免直接背名称。` : `${c.question} 实像可在光屏上承接，虚像不能；再用物距区间与两条主光线复画一次，避免把记忆表格套错区间。`],
  );
}

function physicsOpticsBlocks(c: BoardContext): BoardBlock[] {
  const opticalText = `${c.task} ${c.evidence}`;
  const mirrorContext = /(?:平面镜|镜面|镜子)/.test(opticalText);
  const mirrorImageTask = /(?:成像|像到|像距|物距|虚像|像的位置|像在哪里|像的大小|物像距离|靠近.{0,10}(?:镜子|镜面)|远离.{0,10}(?:镜子|镜面))/.test(opticalText);
  if (mirrorContext && mirrorImageTask) return physicsMirrorImageBlocks(c);
  if (/(?:平面镜|镜面|镜子|反射角|反射光|返回光线)/.test(opticalText)) return physicsReflectionBlocks(c);
  const angleTask = /(?:入射角|折射角|偏折|斜射|入水|出水|两个角|角的大小|夹角|与(?:水面|界面).{0,12}(?:\d+(?:°|度)?|[αβθ]))/.test(opticalText);
  const boundary = angleTask
    ? "比较角度时必须都以法线为基准；从空气进入水等更密介质时向法线偏折，不能把界面夹角当入射角。"
    : "眼睛沿到达的光线反向寻找物体位置；反向延长线只表示虚像方向，不是真实光路。";
  const recap = angleTask
    ? `${c.question} 最后按“介质变化—相对法线偏折—入射角与折射角关系”解释方向变化。`
    : `${c.question} 从物体发光或反光开始，沿每段光路解释观察者为何看到当前位置或方向。`;
  return blocks(["光学系统", `${c.task} 先标出光源、介质、界面与观察者，明确光实际从哪里进入眼睛。`], ["光路追踪", `${c.clue} 沿传播方向画入射光，在界面处作法线，再标反射光或折射光。`], ["规律应用", `${c.approach} 根据光从哪种介质进入哪种介质，判断相对法线的偏折方向，不凭图形外观猜测。`], ["边界辨析", boundary], ["现象回译", recap]);
}

function physicsMirrorImageBlocks(c: BoardContext): BoardBlock[] {
  return blocks(["物像对象", `${c.task} 先区分镜前物体、镜面和镜后像的位置，像不是镜面上的光斑。`], ["对称关系", `${c.clue} 以镜面为对称轴，物与像到镜面的垂直距离相等，连线垂直镜面。`], ["成像性质", `${c.approach} 平面镜所成的像与物等大、正立，并位于镜后；实际光线不会在像的位置会聚。`], ["虚像辨析", "眼睛根据反射光的反向延长线判断像的位置，因此像可以被看到，但不能用光屏承接。"], ["位置复核", `${c.question} 最后按“物距—等距对称—像的位置—虚像性质”逐项检查。`]);
}

function physicsReflectionBlocks(c: BoardContext): BoardBlock[] {
  return blocks(["反射系统", `${c.task} 先标出入射光、反射面与入射点，确定光实际到达平面镜的位置。`], ["法线基准", `${c.clue} 过入射点作垂直镜面的法线，入射角和反射角都必须相对法线测量。`], ["反射定律", `${c.approach} 反射光线与入射光线分居法线两侧，反射角等于入射角。`], ["角度辨析", "题目若给的是光线与镜面的夹角，必须先换成它与法线的夹角；不能把镜面夹角直接当作入射角。"], ["光路复核", `${c.question} 按“入射光—入射点—法线—等角反射”逐段核对方向和角度。`]);
}

function boardContext(session: LearningSession, profile: SubjectBoardProfile, node?: KnowledgeNode): BoardContext {
  const evidences = evidenceClauses(session.problem.text);
  const evidence = evidences[0] ?? "";
  const root = session.nodes.find((item) => item.id === session.rootNodeId);
  const answer = root?.check.answer ?? "";
  const focus = clean(safeGeneratedField(node?.title, answer, profile.moves[0].purpose), 54);
  const task = safeGeneratedField(node?.simplification, answer, `${profile.moves[0].purpose}：${clean(session.problem.text, 100)}`);
  const diagnostic = safeGeneratedField(node?.diagnosticEvidence, answer, "");
  const clue = diagnostic && !isTaskInstructionText(diagnostic) ? diagnostic : evidence || profile.thesis;
  const nodeExplanation = node?.teaching.explanation ?? "";
  const approachSource = safeGeneratedField(nodeExplanation, answer, profile.thesis);
  return {
    task: clean(task, 100),
    clue: clean(clue, 110),
    approach: /(?:^|\n)#{1,6}\s|\n\s*\n/.test(approachSource) ? "沿题目已有证据逐步推进，并检查每个中间依据是否成立。" : clean(approachSource, 120),
    question: clean(safeGeneratedField(node?.teaching.parentPrompt, answer, profile.moves[4].selfCheck), 90),
    focus,
    evidence,
    evidences,
    source: session.problem.text,
    answer,
  };
}

function currentAnswerIs(context: BoardContext, term: string): boolean {
  return context.answer.normalize("NFKC").trim() === term;
}

function safeGeneratedField(value: string | undefined, answer: string, fallback: string): string {
  const candidate = value?.trim() ?? "";
  return candidate && !generatedTextContainsAnswer(candidate, answer) ? candidate : fallback;
}

function evidenceClauses(text: string): string[] {
  const clauses = extractBoardEvidenceClauses(text).filter((item) => item.length >= 4);
  const unique = Array.from(new Set(clauses.map((item) => clean(item, 100)))).filter(Boolean).slice(0, 5);
  return unique;
}

function blocks(...items: [string, string][]): BoardBlock[] {
  return items.map(([label, content], index) => ({ id: `board-${index + 1}`, label, content, tone: index === 1 || index === items.length - 1 ? "key" : index === 2 ? "example" : "plain" }));
}

function profile(discipline: Subject, label: string, thesis: string, moves: SubjectBoardProfile["moves"]): SubjectBoardProfile { return { discipline, label, thesis, moves }; }
function move(id: BoardDisciplineMove, label: string, role: BoardTeachingRole, purpose: string, selfCheck: string) { return { id, label, role, purpose, selfCheck }; }
function clean(value: string, maximum: number): string {
  const text = value.replace(/^#{1,6}\s*/gm, "").replace(/_{2,}/g, (blank) => "＿".repeat(blank.length)).replace(/[*`>#]/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= maximum && isBalanced(text)) return text;
  for (let end = Math.min(maximum, text.length); end >= Math.min(12, maximum); end -= 1) {
    const candidate = text.slice(0, end).replace(/[，、：；\s]+$/, "");
    if (isBalanced(candidate)) return end < text.length ? `${candidate}…` : candidate;
  }
  return text.replace(/[$\\]/g, "").slice(0, maximum).trim();
}

function isBalanced(value: string): boolean { try { assertBalancedLearningMarkup(value, "学科原生板书文本"); return true; } catch { return false; } }
