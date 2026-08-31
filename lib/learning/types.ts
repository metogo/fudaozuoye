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

export interface BoardLesson {
  title: string;
  subtitle: string;
  layout: BoardLayout;
  blocks: BoardBlock[];
  annotations: BoardAnnotation[];
  visual?: BoardVisual | null;
  returnLabel: string;
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
  | { type: "choose"; gateId: string; choice: LearningChoice }
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
