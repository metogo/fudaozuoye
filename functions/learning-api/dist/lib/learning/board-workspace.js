"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileBoardDocument = compileBoardDocument;
exports.createBoardWorkspaceState = createBoardWorkspaceState;
exports.restoreBoardWorkspaceState = restoreBoardWorkspaceState;
exports.isStoredBoardWorkspaceState = isStoredBoardWorkspaceState;
exports.boardNodeRecallState = boardNodeRecallState;
const WORKSPACE_VERSION = 1;
const modes = new Set(["overview", "derive", "recall"]);
function compileBoardDocument(lesson) {
    const scenes = lesson.plan?.scenes ?? lesson.blocks.map((block, index) => ({
        id: block.id,
        title: block.label,
        content: block.content,
        tone: block.tone,
        intent: fallbackIntent(index),
        sourceMessageIds: [],
        visual: null,
    }));
    if (scenes.length === 0)
        throw new Error("板书没有可编排的学习节点");
    if (new Set(scenes.map((scene) => scene.id)).size !== scenes.length)
        throw new Error("板书学习节点不能重复");
    const nodes = scenes.map((scene, sceneIndex) => ({
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
        for (const prerequisiteId of node.prerequisiteIds)
            byId.get(prerequisiteId)?.dependentIds.push(node.id);
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
function createBoardWorkspaceState(document) {
    return {
        version: WORKSPACE_VERSION,
        documentKey: document.key,
        mode: "overview",
        activeNodeId: document.nodes[0]?.id ?? "",
        nodes: document.nodes.map(emptyNodeState),
    };
}
function restoreBoardWorkspaceState(document, value) {
    if (!isStoredBoardWorkspaceState(value, document))
        return createBoardWorkspaceState(document);
    return cloneWorkspaceState(value);
}
function isStoredBoardWorkspaceState(value, document) {
    if (!isRecord(value) || value.version !== WORKSPACE_VERSION || value.documentKey !== document.key)
        return false;
    if (!modes.has(String(value.mode)) || typeof value.activeNodeId !== "string")
        return false;
    const nodeIds = new Set(document.nodes.map((node) => node.id));
    if (!nodeIds.has(value.activeNodeId) || !Array.isArray(value.nodes) || value.nodes.length !== document.nodes.length)
        return false;
    if (new Set(value.nodes.map((node) => isRecord(node) && typeof node.nodeId === "string" ? node.nodeId : "")).size !== document.nodes.length)
        return false;
    return value.nodes.every((node) => {
        if (!isRecord(node) || typeof node.nodeId !== "string" || !nodeIds.has(node.nodeId))
            return false;
        return typeof node.revealed === "boolean";
    });
}
function boardNodeRecallState(state, nodeId) {
    return state.nodes.find((node) => node.nodeId === nodeId) ?? emptyNodeState({ id: nodeId });
}
function prerequisiteIds(scenes, index) {
    if (index === 0)
        return [];
    const current = scenes[index];
    const prior = scenes.slice(0, index);
    const semantic = current.intent === "derive"
        ? prior.filter((scene) => scene.intent === "extract" || scene.intent === "connect")
        : current.intent === "verify" || current.intent === "compare"
            ? prior.filter((scene) => scene.intent === "derive" || scene.intent === "connect").slice(-2)
            : [];
    return Array.from(new Set([scenes[index - 1].id, ...semantic.map((scene) => scene.id)]));
}
function fallbackIntent(index) {
    return ["extract", "connect", "derive", "verify", "compare"][index] ?? "verify";
}
function emptyNodeState(node) {
    return { nodeId: node.id, revealed: false };
}
function cloneWorkspaceState(state) {
    return { ...state, nodes: state.nodes.map((node) => ({ ...node })) };
}
function stableHash(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}
function isRecord(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
