"use client";

import dynamic from "next/dynamic";
import type { BoardSemanticVisual } from "@/lib/learning/types";
import { RichLearningText } from "./rich-learning-text";

const BoardDiagram = dynamic(() => import("./board-diagram").then((module) => module.BoardDiagram), { ssr: false });
const BoardMathVisual = dynamic(() => import("./board-math-visual").then((module) => module.BoardMathVisual), { ssr: false });

export function BoardSceneVisual({ visual, purpose }: { visual: BoardSemanticVisual; purpose?: string }) {
  return <figure className="board-scene-visual">
    <div className="board-scene-visual__heading"><div><p>把关系变得可见</p><h3>{visual.title}</h3></div><span>{visualLabel(visual.kind)}</span></div>
    {purpose && <div className="board-scene-visual__purpose"><span>它帮助你</span><RichLearningText text={purpose} compact/></div>}
    <div className="board-scene-visual__canvas"><VisualCanvas visual={visual}/></div>
    <figcaption><RichLearningText text={visual.caption} compact/></figcaption>
    <p className="board-scene-visual__evidence"><span>依据</span><RichLearningText text={visual.evidence} compact/></p>
  </figure>;
}

function visualLabel(kind: BoardSemanticVisual["kind"]): string {
  if (kind === "formula_chain") return "公式脉络";
  if (kind === "concept_graph") return "关系图";
  if (kind === "geometry_model") return "可交互几何";
  if (kind === "function_plot") return "函数图像";
  if (kind === "evidence_chain") return "证据链";
  if (kind === "timeline") return "时间线";
  if (kind === "process_flow") return "过程链";
  return "对比矩阵";
}

function VisualCanvas({ visual }: { visual: BoardSemanticVisual }) {
  if (visual.kind === "formula_chain") return <div className="board-formula-chain">{visual.steps.map((step, index) => <div key={step.id}><span>{index + 1}</span><div><div className="board-formula-chain__expression"><RichLearningText text={step.expression}/></div><p><RichLearningText text={step.explanation} compact/></p></div></div>)}</div>;
  if (visual.kind === "concept_graph") return <BoardDiagram visual={visual}/>;
  if (visual.kind === "geometry_model" || visual.kind === "function_plot") return <BoardMathVisual visual={visual}/>;
  if (visual.kind === "evidence_chain") return <div className="board-evidence-chain">{visual.links.map((link) => <div key={link.id}><blockquote><RichLearningText text={link.quote} compact/></blockquote><span aria-hidden="true">→</span><p><RichLearningText text={link.meaning} compact/></p></div>)}</div>;
  if (visual.kind === "timeline") return <ol className="board-subject-timeline">{visual.events.map((event) => <li key={event.id}><time>{event.time}</time><p><RichLearningText text={event.event} compact/></p></li>)}</ol>;
  if (visual.kind === "process_flow") return <ol className="board-subject-process">{visual.steps.map((step, index) => <li key={step.id}><span>{index + 1}</span><div><strong>{step.label}</strong><p><RichLearningText text={step.evidence} compact/></p></div></li>)}</ol>;
  return <div className="board-comparison-matrix"><div/><strong><RichLearningText text={visual.columns[0]} compact/></strong><strong><RichLearningText text={visual.columns[1]} compact/></strong>{visual.rows.flatMap((row) => [<b key={`${row.id}-aspect`}><RichLearningText text={row.aspect} compact/></b>, <p key={`${row.id}-left`}><RichLearningText text={row.left} compact/></p>, <p key={`${row.id}-right`}><RichLearningText text={row.right} compact/></p>])}</div>;
}
