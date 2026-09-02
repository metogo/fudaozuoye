import type {
  BoardDocument,
  BoardDocumentNode,
  BoardLesson,
  BoardNodeRecallState,
  BoardScene,
  BoardSceneIntent,
  BoardWorkspaceState,
} from "./types";

const WORKSPACE_VERSION = 1 as const;
const modes = new Set(["overview", "derive", "recall"]);

export function compileBoardDocument(lesson: BoardLesson): BoardDocument {
  const scenes: BoardScene[] = lesson.plan?.scenes ?? lesson.blocks.map((block, index) => ({
    id: block.id,
    title: block.label,
    content: block.content,
    tone: block.tone,
    intent: fallbackIntent(index),
    sourceMessageIds: [] as string[],
    visual: null,
  }));
  if (scenes.length === 0) throw new Error("板书没有可编排的学习节点");
  if (new Set(scenes.map((scene) => scene.id)).size !== scenes.length) throw new Error("板书学习节点不能重复");

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

  const learningGoal = lesson.plan?.learningGoal ?? lesson.subtitle;
  return {
    version: WORKSPACE_VERSION,
    key: `board-${stableHash([lesson.title, lesson.plan?.contentRevision ?? 0, lesson.plan?.discipline ?? lesson.plan?.subject ?? "", lesson.plan?.thesis ?? "", learningGoal, ...scenes.flatMap((scene) => [scene.id, scene.title, scene.content, scene.role ?? "", scene.move ?? "", scene.purpose ?? "", scene.evidence ?? "", scene.why ?? "", scene.selfCheck ?? ""])].join("\u241f"))}`,
    title: lesson.title,
    learningGoal,
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
  if (!isStoredBoardWorkspaceState(value, document)) return createBoardWorkspaceState(document);
  return cloneWorkspaceState(value);
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

function fallbackIntent(index: number): BoardSceneIntent {
  return (["extract", "connect", "derive", "verify", "compare"] as BoardSceneIntent[])[index] ?? "verify";
}

function emptyNodeState(node: Pick<BoardDocumentNode, "id">): BoardNodeRecallState {
  return { nodeId: node.id, revealed: false };
}

function cloneWorkspaceState(state: BoardWorkspaceState): BoardWorkspaceState {
  return { ...state, nodes: state.nodes.map((node) => ({ ...node })) };
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
