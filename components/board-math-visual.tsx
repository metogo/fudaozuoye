"use client";

import { useEffect, useId, useRef, useState } from "react";
import { evaluatePolynomial, functionBoundingBox, geometryBoundingBox, geometryPointPositions } from "@/lib/learning/board-render";
import type { BoardFunctionVisual, BoardGeometryVisual } from "@/lib/learning/types";

const colors = { emerald: "#047857", amber: "#d97706", rose: "#e11d48" } as const;

export function BoardMathVisual({ visual }: { visual: BoardGeometryVisual | BoardFunctionVisual }) {
  const reactId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<{ zoomIn: () => void; zoomOut: () => void } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let dispose = () => {};
    void import("jsxgraph").then(({ default: JXG }) => {
      if (!active || !containerRef.current) return;
      const elementId = `board-math-${reactId.replace(/[^A-Za-z0-9]/g, "")}`;
      containerRef.current.id = elementId;
      const board = JXG.JSXGraph.initBoard(elementId, {
        boundingbox: visual.kind === "function_plot" ? functionBoundingBox(visual) : geometryBoundingBox(visual),
        axis: visual.kind === "function_plot", showCopyright: false, showNavigation: false, keepAspectRatio: true,
        pan: { enabled: false }, zoom: { wheel: false },
      });
      boardRef.current = board;
      dispose = () => JXG.JSXGraph.freeBoard(board);
      if (visual.kind === "function_plot") drawFunctions(board, visual);
      else drawGeometry(board, visual);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; boardRef.current = null; dispose(); };
  }, [reactId, visual]);

  if (failed) return <div className="board-visual-fallback" role="status">图形暂时无法加载，下面的文字板书仍可继续阅读。</div>;
  return <div className="board-jxg-wrap"><div ref={containerRef} className="board-jxg jxgbox" aria-label={visual.title}/><div className="board-jxg-controls" aria-label="图形缩放"><button type="button" onClick={() => boardRef.current?.zoomOut()} aria-label="缩小图形">−</button><button type="button" onClick={() => boardRef.current?.zoomIn()} aria-label="放大图形">＋</button></div></div>;
}

function drawFunctions(board: { create: (type: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown }, visual: BoardFunctionVisual) {
  for (const series of visual.series) board.create("functiongraph", [(x: number) => evaluatePolynomial(series.coefficients, x), ...visual.domain], { name: series.label, strokeColor: colors[series.color], strokeWidth: 2.5, highlight: false });
}

function drawGeometry(board: { create: (type: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown }, visual: BoardGeometryVisual) {
  const points = new Map<string, unknown>();
  const positions = geometryPointPositions(visual);
  for (const point of visual.points) points.set(point.id, board.create("point", [positions[point.id].x, positions[point.id].y], { name: point.label, fixed: true, size: 2.8, strokeColor: "#064e3b", fillColor: "#ecfdf5", highlight: false }));
  for (const object of visual.objects) {
    if (object.type === "circle") {
      board.create("circle", object.through ? [points.get(object.center), points.get(object.through)] : [points.get(object.center), object.radius], { name: object.label ?? "", strokeColor: "#d97706", strokeWidth: 2, fixed: true, highlight: false });
    } else if (object.type === "right_angle") {
      board.create("angle", [points.get(object.from), points.get(object.vertex), points.get(object.to)], { name: "", radius: 0.45, orthoType: "square", type: "square", fillColor: "#fef3c7", strokeColor: "#d97706", fixed: true, highlight: false });
    } else {
      board.create(object.type === "arrow" ? "arrow" : object.type, [points.get(object.from), points.get(object.to)], { name: object.label ?? "", strokeColor: "#064e3b", strokeWidth: 2, fixed: true, highlight: false });
    }
  }
}
