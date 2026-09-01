"use client";

import dynamic from "next/dynamic";
import type { BoardSemanticVisual } from "@/lib/learning/types";
import { RichLearningText } from "./rich-learning-text";

const BoardDiagram = dynamic(() => import("./board-diagram").then((module) => module.BoardDiagram), { ssr: false });
const BoardMathVisual = dynamic(() => import("./board-math-visual").then((module) => module.BoardMathVisual), { ssr: false });

export function BoardSceneVisual({ visual }: { visual: BoardSemanticVisual }) {
  return <figure className="board-scene-visual">
    <div className="board-scene-visual__heading"><div><p>辅助理解</p><h3>{visual.title}</h3></div><span>{visualLabel(visual.kind)}</span></div>
    <div className="board-scene-visual__canvas">{visual.kind === "formula_chain" ? <div className="board-formula-chain">{visual.steps.map((step, index) => <div key={step.id}><span>{index + 1}</span><div><RichLearningText text={step.expression}/><p><RichLearningText text={step.explanation} compact/></p></div></div>)}</div> : visual.kind === "concept_graph" ? <BoardDiagram visual={visual}/> : <BoardMathVisual visual={visual}/>}</div>
    <figcaption><RichLearningText text={visual.caption} compact/></figcaption>
    <p className="board-scene-visual__evidence"><span>依据</span>{visual.evidence}</p>
  </figure>;
}

function visualLabel(kind: BoardSemanticVisual["kind"]): string {
  return kind === "formula_chain" ? "公式脉络" : kind === "concept_graph" ? "关系图" : kind === "geometry_model" ? "可交互几何" : "函数图像";
}
