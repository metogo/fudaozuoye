"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileBoardExperience = compileBoardExperience;
exports.assertBoardExperience = assertBoardExperience;
exports.legacyBoardWorkspaceKey = legacyBoardWorkspaceKey;
const board_director_1 = require("./board-director");
const board_visual_runtime_1 = require("./board-visual-runtime");
const EXPERIENCE_VERSION = 1;
/** 单向迁移入口：运行时不再直接消费 BoardLesson。 */
function compileBoardExperience(lesson, migration) {
    const legacyScenes = lesson.plan?.scenes ?? lesson.blocks.map((block, index) => ({
        id: block.id,
        title: block.label,
        content: block.content,
        tone: block.tone,
        intent: fallbackIntent(index),
        sourceMessageIds: [],
        visual: null,
    }));
    if (legacyScenes.length < 2)
        throw new Error("板书至少需要两个有独立价值的学习场景");
    if (new Set(legacyScenes.map((scene) => scene.id)).size !== legacyScenes.length)
        throw new Error("板书学习节点不能重复");
    const selectedScenes = lesson.plan?.version === 2 ? legacyScenes : (0, board_director_1.directBoardScenes)(legacyScenes);
    const scenes = selectedScenes.map(compileScene);
    if (scenes.length < 2 || scenes.length > 6)
        throw new Error("板书场景数量必须在 2 到 6 个之间");
    const primarySceneIds = new Set(scenes.filter((scene) => scene.medium !== "text").map((scene) => scene.id));
    const learningGoal = lesson.plan?.learningGoal ?? lesson.subtitle;
    const experience = {
        version: EXPERIENCE_VERSION,
        key: `experience-${stableHash([lesson.title, learningGoal, ...scenes.flatMap(sceneSignature)].join("\u241f"))}`,
        legacyWorkspaceKey: migration?.legacyWorkspaceKey ?? legacyBoardWorkspaceKey(lesson),
        title: lesson.title,
        learningGoal,
        ...(lesson.plan?.discipline ?? lesson.plan?.subject ? { subject: lesson.plan?.discipline ?? lesson.plan?.subject } : {}),
        layout: lesson.layout,
        annotations: lesson.annotations.filter((annotation) => !primarySceneIds.has(annotation.blockId)),
        ...(lesson.quality ? { quality: lesson.quality } : {}),
        ...(lesson.visual !== undefined ? { legacyVisual: lesson.visual } : {}),
        returnLabel: lesson.returnLabel,
        scenes,
    };
    assertBoardExperience(experience);
    return experience;
}
function assertBoardExperience(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("板书体验协议不合法");
    const experience = value;
    if (experience.version !== EXPERIENCE_VERSION || !text(experience.key) || !text(experience.legacyWorkspaceKey) || !text(experience.title) || !text(experience.learningGoal)
        || !Array.isArray(experience.scenes) || experience.scenes.length < 2 || experience.scenes.length > 6
        || !["relation", "steps", "comparison", "formula"].includes(String(experience.layout))
        || !Array.isArray(experience.annotations) || experience.annotations.some((annotation) => !annotation || !text(annotation.blockId) || !text(annotation.target) || !text(annotation.reason) || !["circle", "underline", "box"].includes(annotation.kind))
        || !text(experience.returnLabel))
        throw new Error("板书体验协议不合法");
    const sceneIds = new Set();
    for (const scene of experience.scenes) {
        if (!scene || !text(scene.id) || !text(scene.title) || !text(scene.content) || sceneIds.has(scene.id)
            || !Array.isArray(scene.elements) || !Array.isArray(scene.actions))
            throw new Error("板书体验场景不合法");
        sceneIds.add(scene.id);
        if (!["text", "derivation", "relation", "source"].includes(scene.medium))
            throw new Error("板书体验介质不合法");
        for (const element of scene.elements) {
            if (!element || typeof element !== "object" || !text(element.id) || !["text", "visual"].includes(element.type))
                throw new Error("板书体验元素不合法");
            if (element.type === "text" ? !text(element.text) : !text(element.fallbackText) || !(0, board_visual_runtime_1.isUsefulBoardVisual)(element.visual))
                throw new Error("板书体验元素内容不合法");
        }
        const elementIds = new Set(scene.elements.map((element) => element.id));
        if (elementIds.size !== scene.elements.length || scene.elements.length === 0)
            throw new Error("板书体验元素必须有稳定且唯一的 ID");
        if (scene.actions.length !== scene.elements.length || scene.actions.some((action) => !action || !text(action.id) || action.type !== "reveal" || !text(action.targetId) || !elementIds.has(action.targetId)))
            throw new Error("板书动作指向了不存在的内容");
        if (new Set(scene.actions.map((action) => action.id)).size !== scene.actions.length)
            throw new Error("板书动作 ID 不能重复");
        if (new Set(scene.actions.map((action) => action.targetId)).size !== scene.actions.length)
            throw new Error("板书元素不能被重复执行");
        const primaryVisual = scene.elements.find((element) => element.type === "visual")?.visual;
        if (scene.medium === "text" ? scene.elements[0]?.type !== "text" : !primaryVisual || mediumFor(primaryVisual.kind) !== scene.medium)
            throw new Error("板书场景与主介质不一致");
    }
}
function compileScene(scene) {
    const visual = (0, board_visual_runtime_1.isUsefulBoardVisual)(scene.visual) ? scene.visual : null;
    const primary = visual && ["formula_chain", "concept_graph", "geometry_model", "evidence_chain"].includes(visual.kind);
    const medium = primary ? mediumFor(visual.kind) : "text";
    const textElement = { id: `${scene.id}-text`, type: "text", text: scene.content };
    const visualElement = visual ? { id: `${scene.id}-visual`, type: "visual", visual, fallbackText: scene.content } : null;
    const elements = primary && visualElement ? [visualElement] : visualElement ? [textElement, visualElement] : [textElement];
    const actions = elements.map((element, index) => ({
        id: `${scene.id}-reveal-${index + 1}`,
        type: "reveal",
        targetId: element.id,
    }));
    return { ...scene, visual, medium, elements, actions };
}
function mediumFor(kind) {
    if (kind === "formula_chain")
        return "derivation";
    if (kind === "evidence_chain")
        return "source";
    return "relation";
}
function fallbackIntent(index) {
    return ["extract", "connect", "derive", "verify", "compare"][index] ?? "verify";
}
function sceneSignature(scene) {
    return [scene.id, scene.title, scene.content, scene.medium, JSON.stringify(scene.visual), scene.role ?? "", scene.move ?? "", scene.purpose ?? "", scene.evidence ?? "", scene.why ?? "", scene.selfCheck ?? "", ...scene.sourceMessageIds];
}
function stableHash(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}
function legacyBoardWorkspaceKey(lesson) {
    const scenes = lesson.plan?.scenes ?? lesson.blocks.map((block, index) => ({
        id: block.id, title: block.label, content: block.content, tone: block.tone,
        intent: fallbackIntent(index), sourceMessageIds: [], visual: null,
    }));
    const learningGoal = lesson.plan?.learningGoal ?? lesson.subtitle;
    const signature = [lesson.title, lesson.plan?.contentRevision ?? 0, lesson.plan?.discipline ?? lesson.plan?.subject ?? "", lesson.plan?.thesis ?? "", learningGoal,
        ...scenes.flatMap((scene) => [scene.id, scene.title, scene.content, scene.role ?? "", scene.move ?? "", scene.purpose ?? "", scene.evidence ?? "", scene.why ?? "", scene.selfCheck ?? ""])].join("\u241f");
    return `board-${stableHash(signature)}`;
}
function text(value) { return typeof value === "string" && Boolean(value.trim()); }
