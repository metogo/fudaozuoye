"use client";

import { useEffect, useRef } from "react";
import rough from "roughjs";
import { learningTextToPlainText } from "@/lib/learning/presentation";
import type { BoardVisual, BoardVisualElement } from "@/lib/learning/types";
import { RichLearningText } from "./rich-learning-text";

interface BoardVisualProps {
  visual: BoardVisual;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function BoardVisualFigure({ visual }: BoardVisualProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.replaceChildren();
    const sketch = rough.svg(svg);
    const seed = stableSeed(visual);
    visual.elements.forEach((element, index) => {
      const group = drawElement(sketch, element, seed + index);
      if (group) svg.appendChild(group);
      if (element.label) svg.appendChild(drawLabel(element));
    });
  }, [visual]);

  return <figure className="board-visual" aria-labelledby="board-visual-title board-visual-caption">
    <div className="board-visual__heading">
      <div><p className="board-visual__eyebrow">题意示意图</p><h2 id="board-visual-title"><RichLearningText text={visual.title} compact/></h2></div>
      <span>不按比例</span>
    </div>
    <div className="board-visual__canvas">
      <svg ref={svgRef} viewBox="0 0 100 68" role="img" aria-label={`${learningTextToPlainText(visual.title)}：${learningTextToPlainText(visual.caption)}`} preserveAspectRatio="xMidYMid meet" />
    </div>
    <figcaption id="board-visual-caption"><strong>看图抓关系：</strong><RichLearningText text={visual.caption} compact/></figcaption>
    <div className="board-visual__evidence"><span>绘图依据</span>“<RichLearningText text={visual.evidence} compact/>”</div>
  </figure>;
}

type RoughSvg = ReturnType<typeof rough.svg>;

function drawElement(sketch: RoughSvg, element: BoardVisualElement, seed: number): SVGGElement | null {
  const common = { seed, stroke: "#064e3b", strokeWidth: 0.58, roughness: 0.78, bowing: 0.55 };
  if (element.type === "point") return sketch.circle(element.x, element.y, 1.9, { ...common, fill: "#d95d45", fillStyle: "solid", stroke: "#d95d45" });
  if (element.type === "line") return sketch.line(element.x, element.y, element.x2!, element.y2!, common);
  if (element.type === "arrow") {
    const group = document.createElementNS(SVG_NAMESPACE, "g");
    group.appendChild(sketch.line(element.x, element.y, element.x2!, element.y2!, common));
    const angle = Math.atan2(element.y2! - element.y, element.x2! - element.x);
    const size = 2.7;
    group.appendChild(sketch.line(element.x2!, element.y2!, element.x2! - size * Math.cos(angle - Math.PI / 6), element.y2! - size * Math.sin(angle - Math.PI / 6), { ...common, seed: seed + 101 }));
    group.appendChild(sketch.line(element.x2!, element.y2!, element.x2! - size * Math.cos(angle + Math.PI / 6), element.y2! - size * Math.sin(angle + Math.PI / 6), { ...common, seed: seed + 202 }));
    return group;
  }
  if (element.type === "circle") return sketch.circle(element.x, element.y, element.radius! * 2, { ...common, fill: "rgba(253,230,138,.24)", fillStyle: "hachure", hachureGap: 2.2 });
  if (element.type === "rect") return sketch.rectangle(element.x, element.y, element.width!, element.height!, { ...common, fill: "rgba(167,243,208,.22)", fillStyle: "hachure", hachureGap: 2.3 });
  if (element.type === "arc") return sketch.arc(element.x, element.y, element.radius! * 2, element.radius! * 2, degrees(element.startAngle!), degrees(element.endAngle!), false, { ...common, stroke: "#d97706" });
  return null;
}

function drawLabel(element: BoardVisualElement): SVGTextElement {
  const text = document.createElementNS(SVG_NAMESPACE, "text");
  const position = labelPosition(element);
  text.setAttribute("x", String(position.x));
  text.setAttribute("y", String(position.y));
  text.setAttribute("text-anchor", position.anchor);
  text.setAttribute("font-size", "3.5");
  text.setAttribute("font-weight", "650");
  text.setAttribute("fill", "#292524");
  text.textContent = element.label ?? "";
  return text;
}

function labelPosition(element: BoardVisualElement): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  if (element.type === "line" || element.type === "arrow") return { x: (element.x + element.x2!) / 2, y: (element.y + element.y2!) / 2 - 2, anchor: "middle" };
  if (element.type === "rect") return { x: element.x + element.width! / 2, y: element.y + element.height! / 2 + 1.2, anchor: "middle" };
  if (element.type === "circle" || element.type === "arc") return { x: element.x, y: element.y - element.radius! - 2, anchor: "middle" };
  return { x: Math.min(96, element.x + 2.2), y: Math.max(4, element.y - 2), anchor: "start" };
}

function degrees(value: number): number {
  return value * Math.PI / 180;
}

function stableSeed(visual: BoardVisual): number {
  const text = `${visual.kind}:${visual.title}:${visual.evidence}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (Math.abs(hash) % 2_000_000_000) + 1;
}
