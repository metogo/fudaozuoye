"use client";

import { useEffect, useRef } from "react";
import { teachingColors, teachingStrokes, type TeachingScene as Scene } from "@/lib/learning/teaching-scene";

/** JSXGraph receives compiler-owned primitives only; text is rendered without HTML parsing. */
export function TeachingScene({ scene, fallbackUrl, alt }: { scene: Scene; fallbackUrl: string; alt: string }) {
  const container = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    let active = true;
    let dispose = () => {};
    if (image.current) image.current.hidden = false;
    if (container.current) container.current.style.visibility = "hidden";
    void import("jsxgraph").then(({ default: JXG }) => {
      if (!active || !container.current) return;
      const board = JXG.JSXGraph.initBoard(container.current, {
        boundingbox: [0, 520, 800, 0], axis: false, showCopyright: false, showNavigation: false,
        keepAspectRatio: true, pan: { enabled: false }, zoom: { wheel: false },
      });
      dispose = () => JXG.JSXGraph.freeBoard(board);
      board.suspendUpdate();
      const fontSize = scene.template === "general" ? Math.max(10, Math.min(19, container.current.clientWidth / 800 * 28)) : 19;
      for (const shape of scene.shapes) {
        const fixed = { fixed: true, highlight: false };
        if (shape.kind === "label") {
          board.create("text", [shape.x, 520 - shape.y + 5, shape.text], { ...fixed, display: "internal", parse: false, anchorX: "middle", anchorY: "middle", fontSize, strokeColor: "#193d32" });
        } else if (shape.kind === "path") {
          if (shape.closed) board.create("polygon", shape.points.map(p => [p[0], 520 - p[1]]), { ...fixed, vertices: { visible: false }, fillColor: teachingColors[shape.color], fillOpacity: 0.3, borders: { strokeColor: teachingStrokes[shape.color], strokeWidth: 3 } });
          else board.create("curve", [shape.points.map(p => p[0]), shape.points.map(p => 520 - p[1])], { ...fixed, strokeColor: teachingStrokes[shape.color], strokeWidth: 3, lastArrow: !!shape.arrow });
        } else if (shape.kind === "circle") {
          board.create("circle", [[shape.x, 520 - shape.y], shape.radius], { ...fixed, strokeColor: teachingStrokes[shape.color], strokeWidth: 3, fillOpacity: 0 });
        } else if (shape.kind === "line") {
          board.create("segment", [[shape.x1, 520 - shape.y1], [shape.x2, 520 - shape.y2]], { ...fixed, strokeColor: teachingColors[shape.color], strokeWidth: shape.width ?? 3 });
        } else {
          board.create("polygon", [[shape.x, 520 - shape.y], [shape.x + shape.width, 520 - shape.y], [shape.x + shape.width, 520 - shape.y - shape.height], [shape.x, 520 - shape.y - shape.height]], {
            ...fixed, vertices: { visible: false, fixed: true }, hasInnerPoints: false,
            fillColor: teachingColors[shape.color], fillOpacity: shape.color === "outline" ? 0 : 1,
            borders: { strokeColor: teachingColors.outline, strokeWidth: 3, dash: shape.dashed ? 2 : 0, highlight: false },
          });
        }
      }
      board.unsuspendUpdate();
      if (image.current) image.current.hidden = true;
      container.current.style.visibility = "visible";
    }).catch(() => { dispose(); });
    return () => { active = false; dispose(); };
  }, [scene]);
  return <div className="relative h-full w-full" role="img" aria-label={alt} data-teaching-template={scene.template} data-teaching-stages={scene.stageIds.join(",")}>
    {/* The same validated scene remains readable if the lazy-loaded renderer is unavailable. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={image} src={fallbackUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
    <div ref={container} className="absolute inset-0 h-full w-full" aria-hidden="true" />
  </div>;
}
