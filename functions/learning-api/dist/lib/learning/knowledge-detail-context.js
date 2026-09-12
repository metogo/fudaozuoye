"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeDetailContext = knowledgeDetailContext;
exports.knowledgeDetailIdentity = knowledgeDetailIdentity;
/** Exactly the node context sent to the model; unrelated graph growth is not a change. */
function knowledgeDetailContext(map, nodeId) {
    const node = map.nodes.find(n => n.id === nodeId);
    if (!node)
        throw new Error("知识点不存在");
    const relations = map.edges.filter(e => e.from === nodeId || e.to === nodeId).map(e => ({ ...e,
        from: map.nodes.find(n => n.id === e.from)?.title,
        to: map.nodes.find(n => n.id === e.to)?.title,
    }));
    return { node, relations };
}
function knowledgeDetailIdentity(map, nodeId) {
    return JSON.stringify(knowledgeDetailContext(map, nodeId));
}
