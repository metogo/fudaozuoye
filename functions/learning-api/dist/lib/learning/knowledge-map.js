"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.relationLabel = void 0;
exports.parseKnowledgeDetail = parseKnowledgeDetail;
exports.parseKnowledgeMap = parseKnowledgeMap;
exports.mapEvidence = mapEvidence;
exports.visibleConceptIds = visibleConceptIds;
exports.arrangeConcepts = arrangeConcepts;
exports.parseMapPositions = parseMapPositions;
function parseKnowledgeDetail(value) {
    const detail = record(value);
    return { summary: clean(detail.summary, 700), application: clean(detail.application, 700) };
}
exports.relationLabel = { prerequisite: "需要先理解", application: "结合使用" };
const record = (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v))
        throw new Error("知识图谱结构不完整");
    return v;
};
const clean = (v, max) => {
    if (typeof v !== "string" || !v.trim() || v.length > max)
        throw new Error("知识图谱内容不完整或过长");
    return v.trim();
};
const compact = (v) => v.replace(/\s+/g, "");
/** Validates a rooted DAG; layout direction always follows root → dependency. */
function parseKnowledgeMap(value, evidenceSource) {
    const raw = record(value);
    if (!Array.isArray(raw.nodes) || raw.nodes.length < 2 || raw.nodes.length > 16 || !Array.isArray(raw.edges) || raw.edges.length > 24)
        throw new Error("知识图谱规模不合法");
    const nodes = raw.nodes.map((v) => {
        const n = record(v);
        const id = clean(n.id, 40);
        if (!/^[a-zA-Z0-9_-]+$/.test(id) || ["__proto__", "constructor", "prototype"].includes(id))
            throw new Error("知识点编号不合法");
        const evidence = typeof n.evidence === "string" ? n.evidence.trim() : "";
        if (evidence.length > 240 || (evidence && !compact(evidenceSource).includes(compact(evidence))))
            throw new Error("知识点引用未对应本题原文");
        return { id, title: clean(n.title, 30), summary: raw.overviewOnly === true ? "" : clean(n.summary, 360), application: raw.overviewOnly === true ? "" : clean(n.application, 360), evidence };
    });
    const ids = new Set(nodes.map(n => n.id));
    if (ids.size !== nodes.length || new Set(nodes.map(n => n.title)).size !== nodes.length)
        throw new Error("知识点重复");
    const rootId = clean(raw.rootId, 40);
    if (!ids.has(rootId))
        throw new Error("缺少核心知识点");
    const edges = raw.edges.map(v => {
        const e = record(v);
        const from = clean(e.from, 40), to = clean(e.to, 40);
        if (!ids.has(from) || !ids.has(to) || from === to || to === rootId || !["prerequisite", "application"].includes(String(e.kind)))
            throw new Error("知识关系不合法");
        return { from, to, kind: e.kind, reason: clean(e.reason, 180) };
    });
    if (new Set(edges.map(e => `${e.from}:${e.to}`)).size !== edges.length)
        throw new Error("知识关系重复");
    const visited = new Set();
    function visit(id, path) {
        if (path.has(id))
            throw new Error("知识关系出现循环");
        if (path.size > 4)
            throw new Error("知识图谱层级过深");
        visited.add(id);
        for (const e of edges.filter(e => e.from === id))
            visit(e.to, new Set([...path, id]));
    }
    visit(rootId, new Set());
    if (visited.size !== nodes.length)
        throw new Error("存在未关联的知识点");
    for (const id of [rootId, ...edges.filter(e => e.from === rootId).map(e => e.to)]) {
        if (!nodes.find(n => n.id === id)?.evidence)
            throw new Error("本题核心知识缺少题目依据");
    }
    return { version: 1, ...(raw.overviewOnly === true ? { overviewOnly: true } : {}), rootId, nodes, edges };
}
function mapEvidence(session) {
    return [session.problem.text, session.problem.visualContext?.summary, ...(session.problem.visualContext?.facts.map(f => f.text) ?? [])].filter(Boolean).join("\n");
}
function visibleConceptIds(map, expanded) {
    const visible = new Set([map.rootId]);
    function visit(id) {
        if (!expanded.has(id))
            return;
        for (const edge of map.edges.filter(e => e.from === id)) {
            if (!visible.has(edge.to)) {
                visible.add(edge.to);
                visit(edge.to);
            }
        }
    }
    visit(map.rootId);
    return visible;
}
/** Stable full-DAG ranks keep shared foundations below all their dependents. */
function arrangeConcepts(map) {
    const ranks = new Map([[map.rootId, 0]]);
    for (let i = 0; i < map.nodes.length; i++)
        for (const e of map.edges) {
            const rank = ranks.get(e.from);
            if (rank !== undefined)
                ranks.set(e.to, Math.max(ranks.get(e.to) ?? 0, rank + 1));
        }
    const positions = {};
    for (const rank of new Set(ranks.values())) {
        const level = map.nodes.filter(n => ranks.get(n.id) === rank);
        level.forEach((n, i) => { positions[n.id] = { x: (i - (level.length - 1) / 2) * 232, y: rank * 208 }; });
    }
    return positions;
}
function parseMapPositions(value, map) {
    const result = arrangeConcepts(map);
    if (!value || typeof value !== "object")
        return result;
    for (const n of map.nodes) {
        const p = value[n.id];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 100000 && Math.abs(p.y) < 100000)
            result[n.id] = { x: p.x, y: p.y };
    }
    return result;
}
