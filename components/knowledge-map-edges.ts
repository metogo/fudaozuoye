import { MarkerType, type Edge } from "@xyflow/react";
import { relationLabel, type MapRelation } from "@/lib/learning/knowledge-map";

/** The live canvas and exported image use the same connectors and labels. */
export function knowledgeMapEdges(relations: MapRelation[], selected: string | null = null, translate: (text: string) => string = text => text): Edge[] {
  return relations.map(e => {
    const active = e.from === selected || e.to === selected;
    return { id: `${e.from}:${e.to}`, source: e.from, target: e.to, type: "smoothstep", label: translate(relationLabel[e.kind]), animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? "#236653" : "#92afa4", width: 16, height: 16 },
      style: { stroke: active ? "#236653" : "#92afa4", strokeWidth: active ? 2.2 : 1.4, opacity: selected && !active ? .22 : 1 },
      labelStyle: { fill: active ? "#205743" : "#526a5f", fontSize: 11 }, labelBgStyle: { fill: "#f6f8f4", fillOpacity: .96 }, labelBgPadding: [7, 4], labelBgBorderRadius: 6 };
  });
}

/** Planned connections are activity guides only; never used by image export. */
export function pendingKnowledgeMapEdges(parents: string[], target: string, stopped: boolean): Edge[] {
  return parents.map(source => ({ id: `pending:${source}:${target}`, source, target, type: "smoothstep", className: "knowledge-map-pending-edge", animated: !stopped, focusable: false, selectable: false,
    style: { stroke: "#86b299", strokeWidth: 1.7, strokeDasharray: "5 6", opacity: stopped ? .35 : .85 },
  }));
}
