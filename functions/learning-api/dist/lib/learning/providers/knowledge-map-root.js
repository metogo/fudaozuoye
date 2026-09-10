"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.observeMapRoot = observeMapRoot;
const knowledge_map_1 = require("../knowledge-map");
const knowledge_map_2 = require("./knowledge-map");
/** Observe the first complete node of the SAME plan, never guess from partial text. */
function observeMapRoot(session, emit) {
    let buffer = "", finished = false;
    return (delta) => {
        if (finished)
            return;
        buffer += delta;
        // Only the canonical prefix is previewable. Other valid JSON field orders
        // still pass through the unchanged full-plan validator when output ends.
        const prefix = buffer.match(/^\s*(?:```json\s*)?\{\s*"rootId"\s*:\s*"core"\s*,\s*"nodes"\s*:\s*\[\s*/i);
        if (!prefix || buffer[prefix[0].length] !== "{")
            return;
        const start = prefix[0].length;
        let depth = 0, quoted = false, escaped = false;
        for (let i = start; i < buffer.length; i++) {
            const char = buffer[i];
            if (quoted) {
                if (escaped)
                    escaped = false;
                else if (char === "\\")
                    escaped = true;
                else if (char === '"')
                    quoted = false;
                continue;
            }
            if (char === '"')
                quoted = true;
            else if (char === "{")
                depth++;
            else if (char === "}" && --depth === 0) {
                finished = true;
                let root;
                try {
                    const node = JSON.parse(buffer.slice(start, i + 1));
                    if (node.id !== "core" || !Array.isArray(node.parents) || node.parents.length)
                        return;
                    const resolved = (0, knowledge_map_2.resolveKnowledgeEvidence)({ nodes: [node] }, session);
                    root = (0, knowledge_map_1.parseKnowledgeMap)({ ...resolved, version: 1, overviewOnly: true, rootId: "core", edges: [] }, (0, knowledge_map_1.mapEvidence)(session), true).nodes[0];
                }
                catch {
                    // Invalid previews are withheld, NOT accepted by fallback. The full
                    // output still goes through validateMapPlan and its bounded repair.
                    return;
                }
                emit(root);
                return;
            }
        }
    };
}
