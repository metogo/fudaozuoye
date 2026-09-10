"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamMapWithContext = streamMapWithContext;
exports.generateKnowledgeMap = generateKnowledgeMap;
exports.generateKnowledgeDetail = generateKnowledgeDetail;
const model_support_1 = require("./model-support");
const knowledge_map_validation_1 = require("./knowledge-map-validation");
const provider_text_request_1 = require("./provider-text-request");
async function streamMapWithContext(context, session, emit, onRoot) {
    const { streamKnowledgeMap } = await Promise.resolve().then(() => __importStar(require("./knowledge-map-stream")));
    try {
        return await streamKnowledgeMap(session, (system, prompt, timeoutMs, onDelta) => (0, provider_text_request_1.requestModelText)(context, system, prompt, undefined, true, timeoutMs, undefined, 2600, onDelta), emit, onRoot);
    }
    catch (error) {
        context.requests.cancelAll();
        throw error;
    }
}
async function generateKnowledgeMap(session, request) {
    const { knowledgeMapSystem, knowledgeMapPrompt, resolveKnowledgeEvidence } = await Promise.resolve().then(() => __importStar(require("./knowledge-map")));
    const { parseKnowledgeMap, mapEvidence } = await Promise.resolve().then(() => __importStar(require("../knowledge-map")));
    return (0, knowledge_map_validation_1.requestMapValue)((system, prompt, timeout) => request(system, prompt, undefined, true, timeout, undefined, 4800), knowledgeMapSystem, knowledgeMapPrompt(session), value => parseKnowledgeMap({ ...resolveKnowledgeEvidence(value, session), overviewOnly: true }, mapEvidence(session)), 40000);
}
async function generateKnowledgeDetail(session, map, nodeId, request) {
    const { knowledgeDetailSystem, knowledgeMapPrompt } = await Promise.resolve().then(() => __importStar(require("./knowledge-map")));
    const { parseKnowledgeDetail } = await Promise.resolve().then(() => __importStar(require("../knowledge-map")));
    const node = map.nodes.find(n => n.id === nodeId);
    if (!node)
        throw new Error("知识点不存在");
    const relations = map.edges.filter(e => e.from === nodeId || e.to === nodeId).map(e => ({ ...e, from: map.nodes.find(n => n.id === e.from)?.title, to: map.nodes.find(n => n.id === e.to)?.title }));
    const raw = await request(knowledgeDetailSystem, JSON.stringify({ original: knowledgeMapPrompt(session), node, relations }), undefined, true, 25000, undefined, 1400);
    return parseKnowledgeDetail((0, model_support_1.parseJsonObject)(raw));
}
