"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BaseEdge, EdgeLabelRenderer, ReactFlow, getSmoothStepPath, useNodesInitialized, useReactFlow, type EdgeProps, type NodeTypes } from "@xyflow/react";
import type { MapPoint, ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";
import { mapImageFrame } from "@/lib/learning/knowledge-map-image";
import { knowledgeMapEdges } from "./knowledge-map-edges";
import styles from "./problem-knowledge-map.module.css";

type Snapshot = { map: ProblemKnowledgeMap; positions: Record<string, MapPoint>; complete: boolean };
const noop = () => undefined;

function ExportEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, label, labelStyle }: EdgeProps) {
  const [path, x, y] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return <><BaseEdge id={id} path={path} markerEnd={markerEnd} style={style}/><EdgeLabelRenderer><div className={styles.exportEdgeLabel} style={{ ...labelStyle, transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>{label}</div></EdgeLabelRenderer></>;
}
const exportEdgeTypes = { smoothstep: ExportEdge };

export function KnowledgeMapExport({ map, positions, complete, nodeTypes }: Snapshot & { nodeTypes: NodeTypes }) {
  const [snapshot, setSnapshot] = useState<(Snapshot & { host: Element }) | null>(null);
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState("");
  const urlRef = useRef<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const finish = useCallback((blob: Blob | null, message?: string) => {
    setSnapshot(null);
    if (!blob) { setError(message || "图片导出失败，请重试"); return; }
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const filename = `本题知识图谱-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    setResult({ url, filename });
    const link = document.createElement("a");
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
  }, []);
  const start = () => {
    if (snapshot || !map.nodes.length) return;
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setError(""); setResult(null);
    setSnapshot({ map, positions: { ...positions }, complete, host: buttonRef.current!.closest("dialog") ?? document.body });
  };
  return <>
    <button ref={buttonRef} className="knowledge-map-export-button" onClick={start} disabled={!map.nodes.length || Boolean(snapshot)} aria-label="导出图片" title="导出全部已生成知识点、连线和关系标签" aria-busy={Boolean(snapshot)}>{snapshot ? "导出中…" : "导出图片"}</button>
    {(error || result) && <div className={`knowledge-map-export-notice ${styles.exportNotice}`} role={error ? "alert" : "status"}>{error || <>图片已生成 · <a href={result!.url} download={result!.filename}>再次下载</a></>}</div>}
    {snapshot && createPortal(<ExportSheet snapshot={snapshot} nodeTypes={nodeTypes} finish={finish}/>, snapshot.host)}
  </>;
}

function ExportSheet({ snapshot, nodeTypes, finish }: { snapshot: Snapshot; nodeTypes: NodeTypes; finish: (blob: Blob | null, message?: string) => void }) {
  const sheet = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<ReturnType<typeof mapImageFrame> | null>(null);
  const nodes = useMemo(() => snapshot.map.nodes.map(concept => ({ id: concept.id, type: "concept", position: snapshot.positions[concept.id],
    data: { concept, root: concept.id === snapshot.map.rootId, expanded: true, childCount: snapshot.map.edges.filter(e => e.from === concept.id).length, dimmed: false, toggle: noop } })), [snapshot]);
  const edges = useMemo(() => knowledgeMapEdges(snapshot.map.edges), [snapshot]);
  useEffect(() => { const timer = setTimeout(() => finish(null, "图片导出超时，请重试"), 30000); return () => clearTimeout(timer); }, [finish]);
  return <div className={styles.exportStage} aria-hidden="true" inert>
    <div ref={sheet} className={`knowledge-map-export-sheet ${styles.exportSheet}`} style={{ width: frame?.width ?? 1024 }}>
      <header><strong>本题知识图谱</strong><span>{snapshot.complete ? `共 ${nodes.length} 个知识点` : `生成中快照 · 已生成 ${nodes.length} 个知识点`}</span></header>
      <div className={styles.canvas} style={{ width: frame?.width ?? 1024, height: frame?.height ?? 768 }}>
        <ReactFlow id="knowledge-map-export" defaultNodes={nodes} defaultEdges={edges} nodeTypes={nodeTypes} edgeTypes={exportEdgeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} minZoom={1} maxZoom={1}>
          <CaptureSheet sheet={sheet} setFrame={setFrame} finish={finish}/>
        </ReactFlow>
      </div>
      <footer>AI 整理，请结合原题理解{!snapshot.complete && " · 本图仅包含导出时已生成的内容"}</footer>
    </div>
  </div>;
}

function CaptureSheet({ sheet, setFrame, finish }: { sheet: React.RefObject<HTMLDivElement | null>; setFrame: (frame: ReturnType<typeof mapImageFrame>) => void; finish: (blob: Blob | null, message?: string) => void }) {
  const initialized = useNodesInitialized();
  const flow = useReactFlow();
  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    const capture = async () => {
      await document.fonts.ready;
      if (cancelled || !sheet.current) return;
      const frame = mapImageFrame(flow.getNodes().map(n => ({ ...n.position, width: n.measured?.width ?? 0, height: n.measured?.height ?? 0 })));
      setFrame(frame);
      await flow.setViewport(frame.viewport);
      // Let the resized canvas, edge labels and marker SVGs commit before taking the snapshot.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (cancelled || !sheet.current) return;
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(sheet.current, { backgroundColor: "#f6f8f4", width: frame.width, height: frame.sheetHeight, pixelRatio: frame.pixelRatio,
        filter: node => !(node instanceof Element && node.matches(".react-flow__attribution,.katex-mathml")) });
      if (!cancelled) finish(blob?.size ? blob : null);
    };
    void capture().catch(e => { if (!cancelled) finish(null, e instanceof Error ? e.message : "图片导出失败，请重试"); });
    return () => { cancelled = true; };
  }, [initialized, flow, sheet, setFrame, finish]);
  return null;
}
