export type ProviderId = "doubao" | "openai" | "xai";
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
  | "complete"
  | "needs_help";

export interface ProblemSnapshot {
  text: string;
  childWork: string;
  subject: Subject;
  gradeBand: GradeBand;
  confidence: number;
  userRevised: boolean;
}

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
  schemaVersion: "1.0";
  requestId: string;
  provider: ProviderId;
  modelId: string;
  mode: "demo" | "live";
  problem: ProblemSnapshot;
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
