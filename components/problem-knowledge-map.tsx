"use client";

import { useUiText } from "./ui-language";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Background, ReactFlow, applyNodeChanges, type NodeChange, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { arrangeConcepts, parseMapPositions, parseKnowledgeDetail, relationLabel, visibleConceptIds, type KnowledgeDetail, type MapConcept, type ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";
import type { LearningSession } from "@/lib/learning/types";
import { CloseIcon } from "./icons";
import { RichLearningText } from "./lazy-rich-learning-text";
import styles from "./problem-knowledge-map.module.css";
import { useKnowledgeMap } from "./use-knowledge-map";
import { KnowledgeMapProgress } from "./knowledge-map-progress";
import { mapPlanPositions } from "@/lib/learning/knowledge-map-stream";
import { knowledgeMapEdges, pendingKnowledgeMapEdges } from "./knowledge-map-edges";
import { KnowledgeMapExport } from "./knowledge-map-export";
import { findMapFocus, mapFocusAncestors, type MapFocus } from "@/lib/learning/knowledge-map-preview";
import { knowledgeMapNodeTypes as nodeTypes, type ConceptNode } from "./knowledge-map-node";
import { KnowledgeMapActivity } from "./knowledge-map-activity";

const noDelete = null;
const fitOptions = { padding: .2, minZoom: .7, maxZoom: 1 };
export function ProblemKnowledgeMapPage({ session, stateToken, onClose, initialFocus }: { session: LearningSession; stateToken: string; onClose: () => void; initialFocus?: MapFocus }) {
  const t = useUiText();
  const generation = useKnowledgeMap(session, stateToken);
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const el = dialog.current;
    const opener = document.activeElement;
    el?.showModal();
    // Release the native modal while it is still connected, before React removes
    // the portal. Passive cleanup runs too late to restore focus reliably.
    return () => {
      if (el?.open) el.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  const close = () => {
    dialog.current?.close();
    onClose();
  };
  return createPortal(<dialog ref={dialog} className={styles.page} aria-labelledby="knowledge-map-title" onCancel={(e) => { e.preventDefault(); close(); }}>
    <header className={styles.header}><button onClick={close} aria-label={t("返回对话")} className={styles.back}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg><span>{t("返回")}</span></button><div className={styles.headerTitle}><h1 id="knowledge-map-title">{t("本题知识图谱")}</h1><p>{t("让知识连起来")}</p></div><span aria-hidden="true"/></header>
    <MapCanvas key={`${generation.attempt}:${generation.saved ? "cached" : "live"}`} generation={generation} initialFocus={initialFocus}/>
  </dialog>, document.body);
}

const emptyMap: ProblemKnowledgeMap = { version: 1, overviewOnly: true, rootId: "pending-core", nodes: [], edges: [] };

function MapCanvas({ generation, initialFocus }: { generation: ReturnType<typeof useKnowledgeMap>; initialFocus?: MapFocus }) {
  const t = useUiText();
  const { saved, save, complete, plan, error, retry, storageNotice: notice, snapshot } = generation;
  const { stateToken, key: cacheKey } = snapshot;
  const rootPreview = !generation.map && Boolean(generation.root);
  const map = useMemo(() => generation.map ?? (generation.root ? { ...emptyMap, rootId: generation.root.id, nodes: [generation.root] } : emptyMap), [generation.map, generation.root]);
  const slots = useMemo(() => plan ? mapPlanPositions(plan) : {}, [plan]);
  const [positions, setPositions] = useState(() => parseMapPositions(saved?.positions, map));
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [expansion, setExpansion] = useState<Record<string, boolean>>({});
  const focusAncestors = useMemo(() => mapFocusAncestors(map, initialFocus), [map, initialFocus]);
  const expanded = useMemo(() => new Set(map.nodes.filter(n => expansion[n.id] ?? (focusAncestors.has(n.id) || (Array.isArray(saved?.expanded) ? saved.expanded.includes(n.id) : plan ? true : n.id === map.rootId))).map(n => n.id)), [map, saved, plan, expansion, focusAncestors]);
  const [selection, setSelection] = useState<{ id: string | null } | null>(null);
  const selected = rootPreview ? null : selection ? selection.id : findMapFocus(map.nodes, initialFocus)?.id ?? null;
  const setSelected = useCallback((id: string | null) => setSelection({ id }), []);
  const [flow, setFlow] = useState<ReactFlowInstance<ConceptNode> | null>(null);
  const [zoom, setZoom] = useState(100);
  const [announcement, setAnnouncement] = useState("");
  const positionsRef = useRef(positions);
  const placed = useMemo(() => ({ ...parseMapPositions(saved?.positions, map), ...slots, ...positions }), [saved, map, slots, positions]);
  useEffect(() => { positionsRef.current = placed; }, [placed]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => visibleConceptIds(map, expanded), [map, expanded]);
  const related = useMemo(() => new Set(selected ? [selected, ...map.edges.filter(e => e.from === selected || e.to === selected).flatMap(e => [e.from, e.to])] : []), [map, selected]);
  const toggle = useCallback((id: string) => { setExpansion(prev => ({ ...prev, [id]: !expanded.has(id) })); setAnnouncement("知识分支已更新，可点击“查看全图”查看完整范围。"); }, [expanded]);
  const readyNodes: ConceptNode[] = useMemo(() => map.nodes.filter(n => visible.has(n.id)).map(concept => ({ id: concept.id, type: "concept", position: placed[concept.id], measured: measured[concept.id], selected: concept.id === selected, draggable: !rootPreview, selectable: !rootPreview, focusable: !rootPreview, ariaLabel: rootPreview ? concept.title : `${concept.title}，按回车查看，方向键移动`, data: { concept, preview: rootPreview, continuing: rootPreview && !plan, root: concept.id === map.rootId, expanded: expanded.has(concept.id), childCount: map.edges.filter(e => e.from === concept.id).length, dimmed: Boolean(selected && !related.has(concept.id)), toggle } })), [map, placed, measured, expanded, selected, related, toggle, visible, rootPreview, plan]);
  const receivedIds = new Set(map.nodes.map(n => n.id));
  const next = !complete ? plan?.nodes.find(n => !receivedIds.has(n.id) && n.parents.every(id => receivedIds.has(id))) : undefined;
  const pendingId = next?.id ?? (!map.nodes.length ? "pending-core" : null);
  const showPending = !complete && pendingId && (!next?.parents.length || next.parents.some(id => visible.has(id) && expanded.has(id)));
  const nodes: ConceptNode[] = useMemo(() => showPending ? [...readyNodes, {
    id: pendingId, type: "concept", position: placed[pendingId] ?? { x: 0, y: 0 }, measured: measured[pendingId], draggable: false, selectable: false, focusable: false,
    data: { concept: { id: pendingId, title: "", summary: "", application: "", evidence: "" }, root: map.nodes.length === 0, expanded: false, childCount: 0, dimmed: false, pending: true, stopped: Boolean(error), toggle },
  }] : readyNodes, [showPending, readyNodes, pendingId, placed, measured, map.nodes.length, error, toggle]);
  const edges = useMemo(() => [
    ...knowledgeMapEdges(map.edges.filter(e => expanded.has(e.from) && visible.has(e.from) && visible.has(e.to)), selected, t),
    ...(showPending && next ? pendingKnowledgeMapEdges(next.parents.filter(id => visible.has(id) && expanded.has(id)), next.id, Boolean(error)) : []),
  ], [map, selected, visible, expanded, t, showPending, next, error]);
  const persist = useCallback((viewport = flow?.getViewport()) => { save({ map, positions: { ...placed, ...positionsRef.current }, expanded: [...expanded], viewport }); }, [map, placed, expanded, flow, save]);
  useEffect(() => { persist(); }, [expanded, persist]);
  useEffect(() => { const flush = () => persist(); window.addEventListener("pagehide", flush); return () => { persist(); window.removeEventListener("pagehide", flush); }; }, [persist]);
  const changes = useCallback((updates: NodeChange<ConceptNode>[]) => {
    // Controlled nodes must retain measurements across drag/selection/re-layout.
    // Dropping them makes React Flow hide nodes and excludes them from fitView.
    setMeasured(previous => {
      let next = previous;
      for (const change of updates) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        const { width, height } = change.dimensions;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
        if (previous[change.id]?.width === width && previous[change.id]?.height === height) continue;
        if (next === previous) next = { ...previous };
        next[change.id] = { width, height };
      }
      return next;
    });
    const next = applyNodeChanges(updates, nodes);
    if (updates.some(u => u.type === "position")) {
      const nextPositions = { ...placed, ...positionsRef.current };
      next.forEach(n => { nextPositions[n.id] = n.position; });
      positionsRef.current = nextPositions;
      setPositions(nextPositions);
    }
  }, [nodes, placed]);
  const duration = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280;
  const recoverView = () => {
    const canvas = canvasRef.current;
    if (!flow || !canvas || !map.nodes.length) return;
    // Use our canonical positions, not potentially stale internal node bounds.
    const boxes = [...visible].map(id => ({ ...(positionsRef.current[id] ?? placed[id]), width: measured[id]?.width ?? 194, height: measured[id]?.height ?? 160 }));
    const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
    const right = Math.max(...boxes.map(b => b.x + b.width)), bottom = Math.max(...boxes.map(b => b.y + b.height));
    const zoom = Math.max(.25, Math.min(1, (canvas.clientWidth - 48) / (right - left), (canvas.clientHeight - 140) / (bottom - top)));
    void flow.setViewport({ x: canvas.clientWidth / 2 - (left + right) / 2 * zoom, y: canvas.clientHeight / 2 + 12 - (top + bottom) / 2 * zoom, zoom }, { duration: duration() });
  };
  const focus = map.nodes.find(n => n.id === selected && visible.has(n.id));
  useEffect(() => {
    if (!selected || !flow) return;
    // The bottom card changes canvas height. Keep the selected node in the
    // remaining visible canvas instead of letting the card cover its anchor.
    const frame = requestAnimationFrame(() => {
      const point = positionsRef.current[selected];
      const canvas = canvasRef.current;
      const zoom = Math.max(.85, flow.getZoom());
      if (point && canvas) void flow.setViewport({ x: canvas.clientWidth / 2 - (point.x + 97) * zoom, y: canvas.clientHeight / 2 - (point.y + 64) * zoom, zoom }, { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240 });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, flow]);
  const savedViewport = saved?.viewport;
  const safeViewport = savedViewport && [savedViewport.x, savedViewport.y, savedViewport.zoom].every(Number.isFinite) && savedViewport.zoom >= .25 && savedViewport.zoom <= 1.8 && Math.abs(savedViewport.x) < 200000 && Math.abs(savedViewport.y) < 200000 ? savedViewport : undefined;
  return <div className={styles.workspace}>
    <KnowledgeMapProgress count={generation.map?.nodes.length ?? 0} total={plan?.nodes.length ?? (complete ? map.nodes.length : null)} complete={complete} error={error} latest={rootPreview ? undefined : map.nodes.at(-1)?.title} rootPreview={rootPreview} retry={retry}/>
    <div ref={canvasRef} className={styles.canvas} aria-label={t("可拖拽的知识图谱")} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLElement && event.target.classList.contains("react-flow__node")) { const id = event.target.getAttribute("data-id"); if (id && map.nodes.some(n => n.id === id)) setSelected(id); } }}>
      <ReactFlow<ConceptNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changes} onNodeClick={(_, node) => { if (!node.data.pending && !node.data.preview) setSelected(node.id); }} onPaneClick={() => setSelected(null)} onNodeDragStop={() => { persist(); setAnnouncement("节点位置已保存"); }} onInit={instance => {
        setFlow(instance);
        if (!saved) {
          const width = canvasRef.current?.clientWidth ?? window.innerWidth;
          const zoom = Math.min(1, (width - 40) / 426);
          void instance.setViewport({ x: width / 2 - 97 * zoom, y: 90, zoom });
          setZoom(Math.round(zoom * 100));
        } else setZoom(Math.round(instance.getZoom() * 100));
      }} onMoveEnd={(_, viewport) => { setZoom(Math.round(viewport.zoom * 100)); persist(viewport); }}
        fitView={Boolean(saved && !safeViewport)} fitViewOptions={fitOptions} defaultViewport={safeViewport} minZoom={.25} maxZoom={1.8} nodeDragThreshold={8} nodeClickDistance={6} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={noDelete} zoomOnDoubleClick={false} panOnScroll zoomOnScroll={false} zoomOnPinch panOnDrag selectionOnDrag={false} autoPanOnNodeDrag preventScrolling ariaLabelConfig={{ "node.a11yDescription.default": "按回车查看知识，使用方向键移动节点，按 Escape 取消选择。" }}>
        <Background color="#bdcfc5" gap={24} size={1}/>
      </ReactFlow>
      <KnowledgeMapActivity active={!complete && !error} count={generation.map?.nodes.length ?? 0} total={plan?.nodes.length ?? null}/>
      <div className={styles.tools} role="group" aria-label={t("图谱视图工具")}><button aria-label={t("缩小图谱")} onClick={() => void flow?.zoomOut({ duration: duration() })}>−</button><span>{zoom}%</span><button aria-label={t("放大图谱")} onClick={() => void flow?.zoomIn({ duration: duration() })}>＋</button><i/><button disabled={!map.nodes.length} onClick={recoverView}>{t("查看全图")}</button><button disabled={!map.nodes.length} onClick={() => { const arranged = plan ? slots : arrangeConcepts(map); positionsRef.current = arranged; setPositions(arranged); setAnnouncement("已恢复整齐布局，知识关系没有改变。"); recoverView(); }}>{t("整理")}</button><KnowledgeMapExport map={generation.map ?? emptyMap} positions={placed} complete={complete} nodeTypes={nodeTypes}/></div>
      <div className={styles.hint}>{t("拖节点排布 · 拖空白移动 · 双指缩放")}</div>
    </div>
    {focus && <section className={styles.detail} aria-label={t("{title}的知识说明", { title: focus.title })}><header><div><span>{t("知识卡片")}</span><h2>{focus.title}</h2></div><button onClick={() => setSelected(null)} aria-label={t("关闭知识卡片")}><CloseIcon/></button></header><div className={styles.detailBody}><KnowledgeExplanation key={focus.id} focus={focus} map={map} stateToken={stateToken} cacheKey={cacheKey} partial={!complete}/>{focus.evidence && <blockquote><small>{t("对应本题条件")}</small><RichLearningText text={focus.evidence}/></blockquote>}{map.edges.filter(e => e.from === focus.id || e.to === focus.id).map(e => <div className={styles.relation} key={`${e.from}:${e.to}`}><p><strong>{map.nodes.find(n => n.id === e.from)?.title}</strong> → <strong>{map.nodes.find(n => n.id === e.to)?.title}</strong></p><span>{t(relationLabel[e.kind])}</span><RichLearningText text={e.reason}/></div>)}</div></section>}
    <footer className={styles.footer}>{notice ? t(notice) : t("布局保存在本机 · 浏览图谱不改变学习进度")}<span>{t("AI 整理，请结合原题理解")}</span></footer><p role="status" className={styles.sr}>{t(announcement)}</p>
  </div>;
}

function KnowledgeExplanation({ focus: initialFocus, map: initialMap, stateToken, cacheKey, partial: initialPartial }: { focus: MapConcept; map: ProblemKnowledgeMap; stateToken: string; cacheKey: string; partial: boolean }) {
  const t = useUiText();
  const [{ focus, map, partial }] = useState(() => ({ focus: initialFocus, map: initialMap, partial: initialPartial }));
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const key = `${cacheKey}:detail:${focus.id}`;
    const identity = JSON.stringify(map);
    const timer = setTimeout(async () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw && raw.length < 100000) {
          const cached = JSON.parse(raw);
          if (cached.identity === identity) { setDetail(parseKnowledgeDetail(cached.detail)); return; }
        }
      } catch { /* Ignore invalid or unavailable storage. */ }
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "/api";
        const response = await fetch(`${base}/learning/knowledge-map`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stateToken, map, nodeId: focus.id, partial }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        const body = await response.json();
        if (!response.ok) throw new Error("详情暂未补充");
        const parsed = parseKnowledgeDetail(body.detail);
        if (controller.signal.aborted) return;
        setDetail(parsed);
        try { localStorage.setItem(key, JSON.stringify({ identity, detail: parsed })); } catch { /* The current card remains usable. */ }
      } catch { if (!controller.signal.aborted) setError(true); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [focus, map, stateToken, cacheKey, attempt, partial]);
  return <>{(detail || !map.overviewOnly) && <><h3>{t("它是什么")}</h3><RichLearningText text={detail?.summary ?? focus.summary}/><h3>{t("本题怎么用")}</h3><RichLearningText text={detail?.application ?? focus.application}/></>}{!detail && <div className={styles.detailStatus} role="status">{error ? <>{t("补充说明暂未加载，仍可浏览图谱。")}<button onClick={() => { setError(false); setAttempt(n => n + 1); }}>{t("重试说明")}</button></> : t("知识关系已就绪，正在补充说明…")}</div>}</>;
}
