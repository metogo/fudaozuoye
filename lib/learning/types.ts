export type ProviderId = "doubao" | "openai" | "xai";
export type ReasoningLevel = "light" | "medium" | "high";
export type Subject = "math" | "physics" | "chemistry";
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

export type BoardSemanticVisual = BoardConceptVisual | BoardGeometryVisual | BoardFunctionVisual | BoardFormulaVisual;

export type BoardTeachingSubject = "math" | "science" | "language" | "humanities" | "general";
export type BoardTeachingRole = "orient" | "model" | "reason" | "misconception" | "transfer" | "recap";

export interface BoardScene {
  id: string;
  intent: BoardSceneIntent;
  role?: BoardTeachingRole;
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
  contentRevision?: 1;
  subject?: BoardTeachingSubject;
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
  confidence: number;
  userRevised: boolean;
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
