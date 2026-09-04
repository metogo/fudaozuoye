"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileBoardDocument = compileBoardDocument;
exports.createBoardWorkspaceState = createBoardWorkspaceState;
exports.restoreBoardWorkspaceState = restoreBoardWorkspaceState;
exports.isStoredBoardWorkspaceState = isStoredBoardWorkspaceState;
exports.boardNodeRecallState = boardNodeRecallState;
const WORKSPACE_VERSION = 1;
const modes = new Set(["overview", "derive", "recall"]);
function compileBoardDocument(experience) {
    const scenes = experience.scenes;
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
    return {
        version: WORKSPACE_VERSION,
        key: `board-${experience.key}`,
        legacyWorkspaceKey: experience.legacyWorkspaceKey,
        title: experience.title,
        learningGoal: experience.learningGoal,
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
    if (isStoredBoardWorkspaceState(value, document))
        return cloneWorkspaceState(value);
    return migrateLegacyWorkspaceState(document, value) ?? createBoardWorkspaceState(document);
}
function migrateLegacyWorkspaceState(document, value) {
    if (!isRecord(value) || value.version !== WORKSPACE_VERSION || typeof value.documentKey !== "string"
        || value.documentKey !== document.legacyWorkspaceKey
        || !modes.has(String(value.mode)) || !Array.isArray(value.nodes))
        return null;
    const oldNodes = new Map();
    for (const raw of value.nodes) {
        if (!isRecord(raw) || typeof raw.nodeId !== "string" || typeof raw.revealed !== "boolean")
            return null;
        oldNodes.set(raw.nodeId, { nodeId: raw.nodeId, revealed: raw.revealed });
    }
    if (!document.nodes.every((node) => oldNodes.has(node.id)))
        return null;
    const activeStillExists = typeof value.activeNodeId === "string" && document.nodes.some((node) => node.id === value.activeNodeId);
    const activeNodeId = activeStillExists ? value.activeNodeId : document.nodes[0]?.id ?? "";
    return {
        version: WORKSPACE_VERSION, documentKey: document.key, mode: activeStillExists ? value.mode : "overview", activeNodeId,
        nodes: document.nodes.map((node) => ({ ...oldNodes.get(node.id) })),
    };
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
function emptyNodeState(node) {
    return { nodeId: node.id, revealed: false };
}
function cloneWorkspaceState(state) {
    return { ...state, nodes: state.nodes.map((node) => ({ ...node })) };
}
function isRecord(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
