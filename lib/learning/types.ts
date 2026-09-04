export type ProviderId = "doubao" | "openai" | "xai";
export type ReasoningLevel = "light" | "medium" | "high";
export const subjects = ["math", "physics", "chemistry", "biology", "chinese", "english", "history", "geography", "politics"] as const;
export type Subject = (typeof subjects)[number];
export type GradeBand = "primary" | "junior" | "senior";
export type CurriculumVersion = "cn-compulsory-2022" | "cn-highschool-2017-2020";
export type DiagnosticEvidenceSource = "problem" | "child_work" | "parent";

export type NodeState =
  | "unchecked"
  | "known"
  | "unknown"
  | "learning"
  | "mastered"
  | "parent_confirmed"
  | "needs_help";

export type SessionStage =
  | "diagnosing"
  | "learning"
  | "original_check"
  | "transfer_check"
  | "reviewed"
  | "complete"
  | "needs_help";

export type LearningFlowStage =
  | "intake"
  | "core_explanation"
  | "guided_reasoning"
  | "remediation"
  | "solution_recall"
  | "original_attempt"
  | "reviewed_complete"
  | "complete";

export type LearningGateKind =
  | "understanding"
  | "node_answer"
  | "solution_review"
  | "solution_recall_answer"
  | "post_solution"
  | "original_answer"
  | "transfer_answer"
  | "needs_help";

export type LearningChoice =
  | "continue"
  | "try"
  | "not_understood"
  | "full_solution"
  | "view_board"
  | "start_recall"
  | "retry_original"
  | "practice_similar"
  | "finish_review";

export type BoardLayout = "relation" | "steps" | "comparison" | "formula";

export interface BoardSuggestion {
  recommended: boolean;
  reason: string;
  layout: BoardLayout;
}

export interface BoardBlock {
  id: string;
  label: string;
  content: string;
  tone: "plain" | "key" | "example";
}

export type BoardSceneIntent = "extract" | "connect" | "derive" | "compare" | "verify";

export interface BoardConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  scopeLabel?: string;
}

export interface BoardAnnotation {
  blockId: string;
  target: string;
  kind: "circle" | "underline" | "box";
  reason: string;
}

export type BoardVisualKind = "geometry" | "optics" | "process" | "relation";

export type BoardVisualElementType = "point" | "line" | "arrow" | "circle" | "rect" | "arc";

export interface BoardVisualElement {
  type: BoardVisualElementType;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  label?: string;
}

export interface BoardVisual {
  kind: BoardVisualKind;
  title: string;
  evidence: string;
  caption: string;
  elements: BoardVisualElement[];
}

export interface BoardConceptNode {
  id: string;
  label: string;
  role: "given" | "relation" | "step" | "check";
}

export interface BoardConceptEdge {
  from: string;
  to: string;
  label?: string;
}

export interface BoardConceptVisual {
  kind: "concept_graph";
  title: string;
  evidence: string;
  caption: string;
  direction: "top-down" | "left-right";
  nodes: BoardConceptNode[];
  edges: BoardConceptEdge[];
}

export interface BoardGeometryPoint {
  id: string;
  label: string;
}

export type BoardGeometryObject =
  | { type: "segment" | "line" | "arrow"; from: string; to: string; label?: string }
  | { type: "circle"; center: string; through?: string; radius?: number; label?: string }
  | { type: "angle"; vertex: string; from: string; to: string; label?: string }
  | { type: "right_angle"; vertex: string; from: string; to: string };

export interface BoardGeometryVisual {
  kind: "geometry_model";
  title: string;
  evidence: string;
  caption: string;
  points: BoardGeometryPoint[];
  objects: BoardGeometryObject[];
}

export interface BoardFunctionSeries {
  id: string;
  label: string;
  coefficients: number[];
  color: "emerald" | "amber" | "rose";
}

export interface BoardFunctionVisual {
  kind: "function_plot";
  title: string;
  evidence: string;
  caption: string;
  domain: [number, number];
  series: BoardFunctionSeries[];
}

export interface BoardFormulaStep {
  id: string;
  expression: string;
  explanation: string;
}

export interface BoardFormulaVisual {
  kind: "formula_chain";
  title: string;
  evidence: string;
  caption: string;
  steps: BoardFormulaStep[];
}

export interface BoardEvidenceChainVisual {
  kind: "evidence_chain";
  title: string;
  evidence: string;
  caption: string;
  links: Array<{ id: string; quote: string; meaning: string }>;
}

export interface BoardTimelineVisual {
  kind: "timeline";
  title: string;
  evidence: string;
  caption: string;
  events: Array<{ id: string; time: string; event: string }>;
}

export interface BoardProcessVisual {
  kind: "process_flow";
  title: string;
  evidence: string;
  caption: string;
  steps: Array<{ id: string; label: string; evidence: string }>;
}

export interface BoardComparisonVisual {
  kind: "comparison_matrix";
  title: string;
  evidence: string;
  caption: string;
  columns: [string, string];
  rows: Array<{ id: string; aspect: string; left: string; right: string }>;
}

export type BoardSemanticVisual = BoardConceptVisual | BoardGeometryVisual | BoardFunctionVisual | BoardFormulaVisual | BoardEvidenceChainVisual | BoardTimelineVisual | BoardProcessVisual | BoardComparisonVisual;

export type BoardTeachingSubject = "math" | "science" | "language" | "humanities" | "general";
export type BoardTeachingRole = "orient" | "model" | "reason" | "misconception" | "transfer" | "recap";
export type BoardDisciplineMove =
  | "frame_relation" | "model_objects" | "transform_with_basis" | "verify_invariant" | "transfer_structure"
  | "define_system" | "inventory_quantities" | "select_law" | "check_direction_unit" | "explain_phenomenon"
  | "identify_substances" | "track_reaction" | "balance_conservation" | "connect_conditions" | "shift_particle_scale"
  | "set_classification_target" | "extract_classification_basis" | "apply_classification_rule" | "check_classification_boundary" | "transfer_classification"
  | "count_reaction_sides" | "model_reaction_structure" | "classify_reaction_pattern" | "separate_reaction_concepts" | "verify_reaction_type"
  | "locate_structure" | "connect_function" | "trace_life_process" | "control_variables" | "explain_regulation"
  | "locate_genetic_information" | "model_transcription" | "model_translation" | "connect_protein_trait" | "verify_expression_chain"
  | "define_research_question" | "identify_variables" | "design_control" | "read_experiment_evidence" | "limit_experiment_conclusion"
  | "identify_trait" | "represent_genotype" | "build_cross" | "compare_probability" | "verify_genetic_explanation"
  | "state_linkage_hypothesis" | "design_reciprocal_cross" | "group_offspring_by_sex" | "compare_cross_outcomes" | "infer_linkage_boundary"
  | "locate_text" | "analyze_language" | "explain_effect" | "connect_structure_theme" | "land_answer"
  | "locate_evidence" | "parse_sentence" | "trace_discourse" | "infer_in_context" | "frame_english_answer"
  | "locate_word_evidence" | "inspect_local_grammar" | "combine_context_clues" | "limit_word_meaning" | "answer_word_in_context"
  | "parse_clause_structure" | "identify_grammar_signal" | "apply_grammar_rule" | "check_grammar_boundary" | "verify_grammar_choice"
  | "define_optical_system" | "trace_light_path" | "apply_optical_rule" | "check_optical_boundary" | "explain_optical_observation"
  | "set_pinhole_system" | "trace_straight_rays" | "model_pinhole_ratio" | "distinguish_pinhole_image" | "verify_pinhole_change"
  | "locate_lens_zones" | "trace_principal_rays" | "judge_ray_intersection" | "classify_lens_image" | "verify_lens_image"
  | "locate_time_space" | "extract_historical_fact" | "build_cause_effect" | "evaluate_impact" | "compare_history"
  | "locate_region" | "extract_geo_factors" | "connect_space" | "explain_geo_process" | "evaluate_human_land"
  | "read_question_direction" | "layer_material" | "match_concept" | "build_argument" | "normalize_expression";

export interface BoardScene {
  id: string;
  intent: BoardSceneIntent;
  role?: BoardTeachingRole;
  move?: BoardDisciplineMove;
  title: string;
  content: string;
  tone: BoardBlock["tone"];
  purpose?: string;
  evidence?: string;
  why?: string;
  selfCheck?: string;
  sourceMessageIds: string[];
  visual?: BoardSemanticVisual | null;
}

export interface BoardPlan {
  version?: 2;
  contentRevision?: 1 | 2;
  subject?: BoardTeachingSubject;
  discipline?: Subject;
  thesis?: string;
  learningGoal: string;
  sourceMessageIds: string[];
  scenes: BoardScene[];
}

export interface BoardLesson {
  title: string;
  subtitle: string;
  layout: BoardLayout;
  blocks: BoardBlock[];
  annotations: BoardAnnotation[];
  visual?: BoardVisual | null;
  plan?: BoardPlan;
  quality?: {
    status: "safe_fallback";
    reason: string;
  };
  returnLabel: string;
}

export type BoardSceneMedium = "text" | "derivation" | "relation" | "source";

export type BoardExperienceElement =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "visual"; visual: BoardSemanticVisual; fallbackText: string };

export interface BoardExperienceAction {
  id: string;
  type: "reveal";
  targetId: string;
}

export interface BoardExperienceScene extends BoardScene {
  medium: BoardSceneMedium;
  elements: BoardExperienceElement[];
  actions: BoardExperienceAction[];
}

export interface BoardExperience {
  version: 1;
  key: string;
  legacyWorkspaceKey: string;
  title: string;
  learningGoal: string;
  subject?: Subject | BoardTeachingSubject;
  layout: BoardLesson["layout"];
  annotations: BoardAnnotation[];
  quality?: BoardLesson["quality"];
  legacyVisual?: BoardVisual | null;
  returnLabel: string;
  scenes: BoardExperienceScene[];
}

export type BoardWorkspaceMode = "overview" | "derive" | "recall";

export interface BoardDocumentNode {
  id: string;
  sceneIndex: number;
  title: string;
  intent: BoardSceneIntent;
  prerequisiteIds: string[];
  dependentIds: string[];
  sourceMessageIds: string[];
  visualKind?: BoardSemanticVisual["kind"];
}

export interface BoardDocument {
  version: 1;
  key: string;
  legacyWorkspaceKey: string;
  title: string;
  learningGoal: string;
  nodes: BoardDocumentNode[];
}

export interface BoardNodeRecallState {
  nodeId: string;
  revealed: boolean;
}

export interface BoardWorkspaceState {
  version: 1;
  documentKey: string;
  mode: BoardWorkspaceMode;
  activeNodeId: string;
  nodes: BoardNodeRecallState[];
}

export interface LearningGateOption {
  id: LearningChoice;
  label: string;
  emphasis: "primary" | "secondary" | "quiet";
}

export interface LearningGate {
  id: string;
  kind: LearningGateKind;
  title: string;
  prompt?: string;
  nodeId?: string;
  options?: LearningGateOption[];
  answerChoices?: string[];
}

export interface SuggestedQuestion {
  id: string;
  text: string;
  scopeLabel: string;
  sourceSummary: string;
}

export interface ChatMessageReference {
  scopeLabel: string;
  sourceSummary: string;
}

export interface LearningFlowState {
  stage: LearningFlowStage;
  focus: TutorScope;
  activeGate: LearningGate | null;
  remediationCount: number;
  explainedNodeIds: string[];
  pathNodeIds: string[];
  viewedSolution: boolean;
  solutionRecallPassed: boolean;
  boardSuggestion: BoardSuggestion | null;
  suggestedQuestions: SuggestedQuestion[];
}

export type LearningMilestone =
  | "problem_understood"
  | "bottleneck_found"
  | "foundation_added"
  | "back_to_problem"
  | "problem_solved";

export type LearningTurnInput =
  | { type: "start" }
  | { type: "question"; text: string }
  | { type: "image_question" }
  | { type: "choose"; gateId: string; choice: LearningChoice; boardContext?: BoardConversationMessage[] }
  | { type: "answer"; gateId: string; answer: string }
  | { type: "image_answer"; gateId: string }
  | { type: "choose_suggestion"; suggestionId: string }
  | { type: "retry_original" }
  | { type: "request_transfer" };

export type ChatMessageKind = "user" | "assistant" | "milestone" | "path" | "result";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  kind: ChatMessageKind;
  text: string;
  createdAt: string;
  scopeLabel?: string;
  status?: "streaming" | "finishing" | "complete" | "error";
  imageUrl?: string;
  surface?: "chat" | "board";
  reference?: ChatMessageReference;
  suggestions?: SuggestedQuestion[];
}

export interface ProblemSnapshot {
  text: string;
  childWork: string;
  subject: Subject;
  gradeBand: GradeBand;
  /** 学生实际所处学段；与题目所属课程学段分离。旧会话缺失时按 gradeBand 处理。 */
  learnerBand?: GradeBand;
  confidence: number;
  userRevised: boolean;
  /** 题目照片中与当前题目相关的视觉证据；原图本身不会写入会话。 */
  visualContext?: ProblemVisualContext;
}

export interface ProblemVisualFact {
  text: string;
  source: "printed_label" | "visual_relation";
  confidence: number;
}

export interface ProblemVisualContext {
  related: boolean;
  affectsSolving: boolean;
  summary: string;
  facts: ProblemVisualFact[];
  confidence: number;
}

export interface ProblemGuide {
  goal: string;
  keyClue: string;
  approach: string;
  firstQuestion: string;
}

export type ProblemGuideSection = "goal" | "keyClue" | "approach";

export type TutorScope =
  | { kind: "problem"; section?: ProblemGuideSection }
  | { kind: "node"; nodeId: string };

export interface CheckItem {
  id: string;
  prompt: string;
  type: "choice" | "short_text";
  choices?: string[];
  answer: string;
  explanation: string;
  conceptId?: string;
}

export interface TeachingContent {
  explanation: string;
  example: string;
  parentPrompt: string;
  expectedSignal: string;
  misconception: string;
  alternateExplanation: string;
}

export interface KnowledgeNode {
  id: string;
  conceptId: string;
  title: string;
  kind: "problem" | "concept";
  difficulty: number;
  atomic: boolean;
  curriculumVersion: CurriculumVersion;
  simplification: string;
  diagnosticEvidence?: string;
  diagnosticEvidenceSource?: DiagnosticEvidenceSource;
  state: NodeState;
  attempts: number;
  teaching: TeachingContent;
  check: CheckItem;
}

export interface KnowledgeEdge {
  from: string;
  to: string;
  reason: string;
}

export interface AssessmentEvidence {
  nodeId: string;
  source: "system" | "parent";
  answer?: string;
  passed: boolean;
  createdAt: string;
}

export interface LearningSession {
  schemaVersion: "1.1";
  requestId: string;
  provider: ProviderId;
  reasoningLevel: ReasoningLevel;
  modelId: string;
  mode: "demo" | "live";
  problem: ProblemSnapshot;
  problemGuide: ProblemGuide;
  flow: LearningFlowState;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  rootNodeId: string;
  currentNodeId: string | null;
  stage: SessionStage;
  evidence: AssessmentEvidence[];
  transferCheck: CheckItem | null;
  originalPassed: boolean;
  transferPassed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientSessionState {
  session: LearningSession;
  stateToken: string;
}

export interface ProviderAvailability {
  id: ProviderId;
  label: string;
  description: string;
  available: boolean;
  mode: "demo" | "live" | "unavailable";
}

export interface ReasoningAvailability {
  id: ReasoningLevel;
  label: "轻度" | "中" | "高";
  available: boolean;
}

export interface ApiMeta {
  schemaVersion: "1.0";
  requestId: string;
  provider: ProviderId;
  modelId: string;
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ApiEnvelope<T> extends ApiMeta {
  data: T | null;
  error: ApiError | null;
}
