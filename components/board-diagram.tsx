"use client";

import { useEffect, useId, useState } from "react";
import type { BoardConceptVisual } from "@/lib/learning/types";
import { conceptGraphDefinition } from "@/lib/learning/board-render";

export function BoardDiagram({ visual }: { visual: BoardConceptVisual }) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", flowchart: { htmlLabels: false, curve: "basis" } });
      const id = `board-diagram-${reactId.replace(/[^A-Za-z0-9]/g, "")}`;
      const result = await mermaid.render(id, conceptGraphDefinition(visual));
      if (active) setSvg(result.svg);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [reactId, visual]);

  if (failed) return <div className="board-visual-fallback board-visual-fallback--relations" role="status"><p>关系图暂时无法绘制，按真实连线列出：</p><ul>{visual.edges.map((edge, index) => {
    const from = visual.nodes.find((node) => node.id === edge.from)?.label ?? edge.from;
    const to = visual.nodes.find((node) => node.id === edge.to)?.label ?? edge.to;
    return <li key={`${edge.from}-${edge.to}-${index}`}>{from}<span> → {edge.label ? `${edge.label} → ` : ""}</span>{to}</li>;
  })}</ul></div>;
  if (!svg) return <div className="board-visual-loading" role="status" aria-label="正在绘制关系图"><i/><i/><i/></div>;
  return <div className="board-mermaid" aria-label={visual.title} dangerouslySetInnerHTML={{ __html: svg }}/>
}
