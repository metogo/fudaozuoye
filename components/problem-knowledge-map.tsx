"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Background, Handle, MarkerType, Position, ReactFlow, applyNodeChanges, type Node, type NodeProps, type NodeChange, type ReactFlowInstance, type Viewport } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { arrangeConcepts, mapEvidence, parseKnowledgeMap, parseMapPositions, parseKnowledgeDetail, relationLabel, visibleConceptIds, type KnowledgeDetail, type MapConcept, type MapPoint, type ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";
import type { LearningSession } from "@/lib/learning/types";
import { CloseIcon, RefreshIcon } from "./icons";
import { RichLearningText } from "./lazy-rich-learning-text";
import styles from "./problem-knowledge-map.module.css";

type ConceptNode = Node<{ concept: MapConcept; root: boolean; expanded: boolean; childCount: number; dimmed: boolean; toggle: (id: string) => void }, "concept">;
const Concept = memo(function Concept({ id, data, selected }: NodeProps<ConceptNode>) {
  return <div className={`${styles.node} ${data.root ? styles.core : ""} ${selected ? styles.selected : ""} ${data.dimmed ? styles.dimmed : ""}`}>
    <Handle type="target" position={Position.Top} isConnectable={false}/>
    <span className={styles.nodeLabel}>{data.root ? "本题核心" : "关联知识"}<span aria-hidden="true">⠿</span></span>
    <strong>{data.concept.title}</strong>
    {data.childCount > 0 ? <button className={`nodrag nopan ${styles.expand}`} onClick={(e) => { e.stopPropagation(); data.toggle(id); }} aria-expanded={data.expanded} aria-label={`${data.expanded ? "收起" : "展开"}${data.concept.title}的基础知识`}>{data.expanded ? "收起基础" : `展开 ${data.childCount} 个基础`}<span aria-hidden="true">{data.expanded ? "−" : "+"}</span></button> : <span className={styles.leaf}>点击了解它在本题的作用</span>}
    <Handle type="source" position={Position.Bottom} isConnectable={false}/>
  </div>;
});
const nodeTypes = { concept: Concept };
const noDelete = null;
const fitOptions = { padding: .2, minZoom: .7, maxZoom: 1 };
const cachePrefix = "problem-knowledge-map-v2:";
interface SavedMap { identity: string; map: ProblemKnowledgeMap; positions?: Record<string, MapPoint>; expanded?: string[]; viewport?: Viewport }

export function ProblemKnowledgeMapPage({ session, stateToken, onClose }: { session: LearningSession; stateToken: string; onClose: () => void }) {
  // A page owns a fixed snapshot; background chat events cannot switch its problem.
  const [snapshot] = useState(() => ({ session, stateToken, identity: JSON.stringify(session.problem), key: cachePrefix + session.requestId }));
  const dialog = useRef<HTMLDialogElement>(null);
  const [map, setMap] = useState<ProblemKnowledgeMap | null>(null);
  const [saved, setSaved] = useState<SavedMap | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [storageNotice, setStorageNotice] = useState("");
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => { el?.close(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const run = async () => {
      try {
        const raw = localStorage.getItem(snapshot.key);
        if (raw && raw.length < 100000) {
          const cached = JSON.parse(raw) as SavedMap;
          if (cached.identity === snapshot.identity) {
            const parsed = parseKnowledgeMap(cached.map, mapEvidence(snapshot.session));
            if (active) { setSaved(cached); setMap(parsed); }
            return;
          }
        }
      } catch { /* An old or damaged cache must never prevent a fresh request. */ }
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "/api";
        const response = await fetch(`${base}/learning/knowledge-map`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stateToken: snapshot.stateToken }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(48000)]) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || "图谱暂未生成，请重试");
        const parsed = parseKnowledgeMap(body.map, mapEvidence(snapshot.session));
        if (active) setMap(parsed);
      } catch (e) {
        if (active) setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "整理知识关系超时了，可以重试，原对话仍然保留。");
      }
    };
    // Defer past Strict Mode's setup/cleanup probe so one click sends one request.
    const startTimer = setTimeout(() => { void run(); }, 0);
    return () => { active = false; clearTimeout(startTimer); controller.abort(); };
  }, [snapshot, attempt]);
  const save = useCallback((data: Omit<SavedMap, "identity">) => {
    try { localStorage.setItem(snapshot.key, JSON.stringify({ ...data, identity: snapshot.identity })); }
    catch { setStorageNotice("浏览器暂时无法保存布局，本次仍可自由调整。"); }
  }, [snapshot]);
  return createPortal(<dialog ref={dialog} className={styles.page} aria-labelledby="knowledge-map-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
    <header className={styles.header}><button onClick={onClose} aria-label="返回对话" className={styles.back}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg><span>返回</span></button><div className={styles.headerTitle}><h1 id="knowledge-map-title">本题知识图谱</h1><p>让知识连起来</p></div><span aria-hidden="true"/></header>
    {map ? <MapCanvas map={map} saved={saved} save={save} notice={storageNotice} stateToken={snapshot.stateToken} cacheKey={snapshot.key}/> : <section className={styles.loading}>{error ? <><div className={styles.errorMark} aria-hidden="true">!</div><h2>这次没能整理好</h2><p role="alert">{error}</p><button onClick={() => { setError(""); setAttempt(v => v + 1); }}><RefreshIcon/>重试生成</button></> : <KnowledgeMapWaiting key={attempt}/>}<button className={styles.quiet} onClick={onClose}>返回继续解题</button></section>}
  </dialog>, document.body);
}

function KnowledgeMapWaiting() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    const timer = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const overtime = elapsed >= 10;
  return <>
    <div className={`${styles.waitDial} ${overtime ? styles.waitOvertime : ""}`} role="timer" aria-live="off" aria-label={overtime ? `已等待 ${elapsed} 秒` : `预计还需约 ${10 - elapsed} 秒`}>
      <svg viewBox="0 0 144 144" aria-hidden="true"><circle cx="72" cy="72" r="65" className={styles.waitTrack}/><circle cx="72" cy="72" r="65" pathLength="100" className={styles.waitArc} strokeDasharray={overtime ? "20 80" : `${Math.max(2, (10 - elapsed) * 10)} 100`}/></svg>
      <span>{overtime ? "已等待" : "预计还需"}</span><strong>{overtime ? elapsed : 10 - elapsed}<small>秒</small></strong>
    </div>
    <div className={styles.waitCopy}><h2>正在连接这道题的知识</h2><p>从本题核心出发，梳理相关知识与依赖。</p></div>
    <div className={styles.waitNote} role="status">{overtime ? "比预计稍久，模型仍在生成，请再稍等。" : "通常约 10 秒，完成后会自动展开图谱。"}</div>
    <span className={styles.waitDisclaimer}>时间为估计，并非生成进度</span>
  </>;
}

function MapCanvas({ map, saved, save, notice, stateToken, cacheKey }: { map: ProblemKnowledgeMap; saved: SavedMap | null; save: (data: Omit<SavedMap, "identity">) => void; notice: string; stateToken: string; cacheKey: string }) {
  const [positions, setPositions] = useState(() => parseMapPositions(saved?.positions, map));
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [expanded, setExpanded] = useState(() => new Set(Array.isArray(saved?.expanded) ? saved.expanded.filter(id => map.nodes.some(n => n.id === id)) : [map.rootId]));
  const [selected, setSelected] = useState<string | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance<ConceptNode> | null>(null);
  const [zoom, setZoom] = useState(100);
  const [announcement, setAnnouncement] = useState("");
  const positionsRef = useRef(positions);
  const canvasRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => visibleConceptIds(map, expanded), [map, expanded]);
  const related = useMemo(() => new Set(selected ? [selected, ...map.edges.filter(e => e.from === selected || e.to === selected).flatMap(e => [e.from, e.to])] : []), [map, selected]);
  const toggle = useCallback((id: string) => { setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); setAnnouncement("知识分支已更新，可点击“查看全图”查看完整范围。"); }, []);
  const nodes: ConceptNode[] = useMemo(() => map.nodes.filter(n => visible.has(n.id)).map(concept => ({ id: concept.id, type: "concept", position: positions[concept.id], measured: measured[concept.id], selected: concept.id === selected, ariaLabel: `${concept.title}，按回车查看，方向键移动`, data: { concept, root: concept.id === map.rootId, expanded: expanded.has(concept.id), childCount: map.edges.filter(e => e.from === concept.id).length, dimmed: Boolean(selected && !related.has(concept.id)), toggle } })), [map, positions, measured, expanded, selected, related, toggle, visible]);
  const edges = useMemo(() => map.edges.filter(e => expanded.has(e.from) && visible.has(e.from) && visible.has(e.to)).map(e => {
    const active = e.from === selected || e.to === selected;
    return { id: `${e.from}:${e.to}`, source: e.from, target: e.to, type: "smoothstep", label: relationLabel[e.kind], animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: active ? "#236653" : "#92afa4", width: 16, height: 16 }, style: { stroke: active ? "#236653" : "#92afa4", strokeWidth: active ? 2.2 : 1.4, opacity: selected && !active ? .22 : 1 }, labelStyle: { fill: active ? "#205743" : "#526a5f", fontSize: 11 }, labelBgStyle: { fill: "#f6f8f4", fillOpacity: .96 }, labelBgPadding: [7, 4] as [number, number], labelBgBorderRadius: 6 };
  }), [map, selected, visible, expanded]);
  const persist = useCallback((viewport = flow?.getViewport()) => { save({ map, positions: positionsRef.current, expanded: [...expanded], viewport }); }, [map, expanded, flow, save]);
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
      const nextPositions = { ...positionsRef.current };
      next.forEach(n => { nextPositions[n.id] = n.position; });
      positionsRef.current = nextPositions;
      setPositions(nextPositions);
    }
  }, [nodes]);
  const duration = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280;
  const recoverView = () => {
    const canvas = canvasRef.current;
    if (!flow || !canvas) return;
    // Use our canonical positions, not potentially stale internal node bounds.
    const boxes = [...visible].map(id => ({ ...positionsRef.current[id], width: measured[id]?.width ?? 194, height: measured[id]?.height ?? 160 }));
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
    <div className={styles.intro}><p>从核心向下，找到它依赖的知识。</p><span>{visible.size} / {map.nodes.length} 个知识点</span></div>
    <div ref={canvasRef} className={styles.canvas} aria-label="可拖拽的知识图谱" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLElement && event.target.classList.contains("react-flow__node")) { const id = event.target.getAttribute("data-id"); if (id) setSelected(id); } }}>
      <ReactFlow<ConceptNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changes} onNodeClick={(_, node) => setSelected(node.id)} onPaneClick={() => setSelected(null)} onNodeDragStop={() => { persist(); setAnnouncement("节点位置已保存"); }} onInit={instance => { setFlow(instance); setZoom(Math.round(instance.getZoom() * 100)); }} onMoveEnd={(_, viewport) => { setZoom(Math.round(viewport.zoom * 100)); persist(viewport); }}
        fitView={!safeViewport} fitViewOptions={fitOptions} defaultViewport={safeViewport} minZoom={.25} maxZoom={1.8} nodeDragThreshold={8} nodeClickDistance={6} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={noDelete} zoomOnDoubleClick={false} panOnScroll zoomOnScroll={false} zoomOnPinch panOnDrag selectionOnDrag={false} autoPanOnNodeDrag preventScrolling ariaLabelConfig={{ "node.a11yDescription.default": "按回车查看知识，使用方向键移动节点，按 Escape 取消选择。" }}>
        <Background color="#bdcfc5" gap={24} size={1}/>
      </ReactFlow>
      <div className={styles.tools} role="group" aria-label="图谱视图工具"><button aria-label="缩小图谱" onClick={() => void flow?.zoomOut({ duration: duration() })}>−</button><span>{zoom}%</span><button aria-label="放大图谱" onClick={() => void flow?.zoomIn({ duration: duration() })}>＋</button><i/><button onClick={recoverView}>查看全图</button><button onClick={() => { const arranged = arrangeConcepts(map); positionsRef.current = arranged; setPositions(arranged); setAnnouncement("已恢复整齐布局，知识关系没有改变。"); recoverView(); }}>整理</button></div>
      <div className={styles.hint}>拖节点排布 · 拖空白移动 · 双指缩放</div>
    </div>
    {focus && <section className={styles.detail} aria-label={`${focus.title}的知识说明`}><header><div><span>知识卡片</span><h2>{focus.title}</h2></div><button onClick={() => setSelected(null)} aria-label="关闭知识卡片"><CloseIcon/></button></header><div className={styles.detailBody}><KnowledgeExplanation key={focus.id} focus={focus} map={map} stateToken={stateToken} cacheKey={cacheKey}/>{focus.evidence && <blockquote><small>对应本题条件</small><RichLearningText text={focus.evidence}/></blockquote>}{map.edges.filter(e => e.from === focus.id || e.to === focus.id).map(e => <div className={styles.relation} key={`${e.from}:${e.to}`}><p><strong>{map.nodes.find(n => n.id === e.from)?.title}</strong> → <strong>{map.nodes.find(n => n.id === e.to)?.title}</strong></p><span>{relationLabel[e.kind]}</span><RichLearningText text={e.reason}/></div>)}</div></section>}
    <footer className={styles.footer}>{notice || "布局保存在本机 · 浏览图谱不改变学习进度"}<span>AI 整理，请结合原题理解</span></footer><p role="status" className={styles.sr}>{announcement}</p>
  </div>;
}

function KnowledgeExplanation({ focus, map, stateToken, cacheKey }: { focus: MapConcept; map: ProblemKnowledgeMap; stateToken: string; cacheKey: string }) {
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
        const response = await fetch(`${base}/learning/knowledge-map`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stateToken, map, nodeId: focus.id }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        const body = await response.json();
        if (!response.ok) throw new Error("详情暂未补充");
        const parsed = parseKnowledgeDetail(body.detail);
        if (controller.signal.aborted) return;
        setDetail(parsed);
        try { localStorage.setItem(key, JSON.stringify({ identity, detail: parsed })); } catch { /* The current card remains usable. */ }
      } catch { if (!controller.signal.aborted) setError(true); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [focus, map, stateToken, cacheKey, attempt]);
  return <>{(detail || !map.overviewOnly) && <><h3>它是什么</h3><RichLearningText text={detail?.summary ?? focus.summary}/><h3>本题怎么用</h3><RichLearningText text={detail?.application ?? focus.application}/></>}{!detail && <div className={styles.detailStatus} role="status">{error ? <>补充说明暂未加载，仍可浏览图谱。<button onClick={() => { setError(false); setAttempt(n => n + 1); }}>重试说明</button></> : "知识关系已就绪，正在补充说明…"}</div>}</>;
}
