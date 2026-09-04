import type {
  BoardDocument,
  BoardDocumentNode,
  BoardExperience,
  BoardNodeRecallState,
  BoardSceneIntent,
  BoardWorkspaceState,
} from "./types";

const WORKSPACE_VERSION = 1 as const;
const modes = new Set(["overview", "derive", "recall"]);

export function compileBoardDocument(experience: BoardExperience): BoardDocument {
  const scenes = experience.scenes;

  const nodes = scenes.map((scene, sceneIndex): BoardDocumentNode => ({
    id: scene.id,
    sceneIndex,
    title: scene.title,
    intent: scene.intent,
    prerequisiteIds: prerequisiteIds(scenes, sceneIndex),
    dependentIds: [],
    sourceMessageIds: [...scene.sourceMessageIds],
    ...(scene.visual ? { visualKind: scene.visual.kind } : {}),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    for (const prerequisiteId of node.prerequisiteIds) byId.get(prerequisiteId)?.dependentIds.push(node.id);
  }

  return {
    version: WORKSPACE_VERSION,
    key: `board-${experience.key}`,
    legacyWorkspaceKey: experience.legacyWorkspaceKey,
    title: experience.title,
    learningGoal: experience.learningGoal,
    nodes,
  };
}

export function createBoardWorkspaceState(document: BoardDocument): BoardWorkspaceState {
  return {
    version: WORKSPACE_VERSION,
    documentKey: document.key,
    mode: "overview",
    activeNodeId: document.nodes[0]?.id ?? "",
    nodes: document.nodes.map(emptyNodeState),
  };
}

export function restoreBoardWorkspaceState(document: BoardDocument, value: unknown): BoardWorkspaceState {
  if (isStoredBoardWorkspaceState(value, document)) return cloneWorkspaceState(value);
  return migrateLegacyWorkspaceState(document, value) ?? createBoardWorkspaceState(document);
}

function migrateLegacyWorkspaceState(document: BoardDocument, value: unknown): BoardWorkspaceState | null {
  if (!isRecord(value) || value.version !== WORKSPACE_VERSION || typeof value.documentKey !== "string"
    || value.documentKey !== document.legacyWorkspaceKey
    || !modes.has(String(value.mode)) || !Array.isArray(value.nodes)) return null;
  const oldNodes = new Map<string, BoardNodeRecallState>();
  for (const raw of value.nodes) {
    if (!isRecord(raw) || typeof raw.nodeId !== "string" || typeof raw.revealed !== "boolean") return null;
    oldNodes.set(raw.nodeId, { nodeId: raw.nodeId, revealed: raw.revealed });
  }
  if (!document.nodes.every((node) => oldNodes.has(node.id))) return null;
  const activeStillExists = typeof value.activeNodeId === "string" && document.nodes.some((node) => node.id === value.activeNodeId);
  const activeNodeId = activeStillExists ? value.activeNodeId as string : document.nodes[0]?.id ?? "";
  return {
    version: WORKSPACE_VERSION, documentKey: document.key, mode: activeStillExists ? value.mode as BoardWorkspaceState["mode"] : "overview", activeNodeId,
    nodes: document.nodes.map((node) => ({ ...oldNodes.get(node.id)! })),
  };
}

export function isStoredBoardWorkspaceState(value: unknown, document: BoardDocument): value is BoardWorkspaceState {
  if (!isRecord(value) || value.version !== WORKSPACE_VERSION || value.documentKey !== document.key) return false;
  if (!modes.has(String(value.mode)) || typeof value.activeNodeId !== "string") return false;
  const nodeIds = new Set(document.nodes.map((node) => node.id));
  if (!nodeIds.has(value.activeNodeId) || !Array.isArray(value.nodes) || value.nodes.length !== document.nodes.length) return false;
  if (new Set(value.nodes.map((node) => isRecord(node) && typeof node.nodeId === "string" ? node.nodeId : "")).size !== document.nodes.length) return false;
  return value.nodes.every((node) => {
    if (!isRecord(node) || typeof node.nodeId !== "string" || !nodeIds.has(node.nodeId)) return false;
    return typeof node.revealed === "boolean";
  });
}

export function boardNodeRecallState(state: BoardWorkspaceState, nodeId: string): BoardNodeRecallState {
  return state.nodes.find((node) => node.nodeId === nodeId) ?? emptyNodeState({ id: nodeId } as BoardDocumentNode);
}

function prerequisiteIds(scenes: Array<{ id: string; intent: BoardSceneIntent }>, index: number): string[] {
  if (index === 0) return [];
  const current = scenes[index];
  const prior = scenes.slice(0, index);
  const semantic = current.intent === "derive"
    ? prior.filter((scene) => scene.intent === "extract" || scene.intent === "connect")
    : current.intent === "verify" || current.intent === "compare"
      ? prior.filter((scene) => scene.intent === "derive" || scene.intent === "connect").slice(-2)
      : [];
  return Array.from(new Set([scenes[index - 1].id, ...semantic.map((scene) => scene.id)]));
}

function emptyNodeState(node: Pick<BoardDocumentNode, "id">): BoardNodeRecallState {
  return { nodeId: node.id, revealed: false };
}

function cloneWorkspaceState(state: BoardWorkspaceState): BoardWorkspaceState {
  return { ...state, nodes: state.nodes.map((node) => ({ ...node })) };
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
