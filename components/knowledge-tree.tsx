"use client";

import type { KnowledgeNode, LearningSession, NodeState } from "@/lib/learning/types";
import { CheckIcon, ChevronIcon } from "./icons";

const statusText: Record<NodeState, string> = { unchecked: "待确认", known: "已掌握", unknown: "这里不会", learning: "正在学习", mastered: "验收通过", parent_confirmed: "家长确认", needs_help: "需真人介入" };

export function KnowledgeTree({ session, activeNodeId, highlightNodeId, onSelect }: { session: LearningSession; activeNodeId: string | null; highlightNodeId: string | null; onSelect: (id: string) => void }) {
  const byId = new Map(session.nodes.map((node) => [node.id, node]));
  const children = new Map<string, KnowledgeNode[]>();
  session.edges.forEach((edge) => {
    const child = byId.get(edge.from);
    if (child) children.set(edge.to, [...(children.get(edge.to) ?? []), child]);
  });
  const root = byId.get(session.rootNodeId);
  if (!root) return null;

  const Branch = ({ node, depth = 0 }: { node: KnowledgeNode; depth?: number }) => {
    const prerequisites = (children.get(node.id) ?? []).sort((a, b) => a.difficulty - b.difficulty);
    const active = activeNodeId === node.id;
    const highlighted = highlightNodeId === node.id;
    const verified = node.state === "mastered" || node.state === "known";
    return <li className={`knowledge-branch depth-${depth}`}>
      <button id={`knowledge-node-${node.id}`} aria-current={active ? "step" : undefined} onClick={() => onSelect(node.id)} className={`knowledge-node-card group relative w-full min-h-[76px] rounded-2xl border p-4 text-left transition ${active ? "border-stone-900 bg-stone-900 text-white shadow-xl" : "border-stone-200 bg-white hover:border-stone-400"} ${highlighted ? "knowledge-node-card-highlight" : ""}`}>
        <span className="mb-2 flex items-center justify-between gap-3"><span className={`text-[10px] font-semibold uppercase tracking-[.12em] ${active ? "text-stone-400" : "text-stone-400"}`}>{depthLabel(node, depth)}</span><span className={`node-status status-${node.state} inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold`}>{verified && <CheckIcon className="h-3 w-3"/>}{statusText[node.state]}</span></span>
        <span className="flex items-center justify-between gap-2"><strong className="text-[15px]">{node.title}</strong><ChevronIcon className={`h-4 w-4 shrink-0 transition ${active ? "text-white" : "text-stone-400"}`}/></span>
        {node.atomic ? <span className={`mt-2 block text-[11px] leading-4 ${active ? "text-amber-200" : "text-amber-700"}`}>已到本学段学习起点，不再机械拆分</span> : node.kind === "concept" && node.diagnosticEvidence ? <span className={`mt-2 block line-clamp-1 text-[11px] ${active ? "text-stone-300" : "text-stone-500"}`}>证据：{evidenceSourceText(node.diagnosticEvidenceSource)}“{node.diagnosticEvidence}”</span> : null}
      </button>
      {prerequisites.length > 0 && <ul className="knowledge-children relative ml-5 space-y-3 border-l border-stone-300 pl-5 pt-3">{prerequisites.map((child) => <Branch key={child.id} node={child} depth={depth + 1}/>)}</ul>}
    </li>;
  };
  return <ul className="knowledge-tree space-y-3"><Branch node={root}/></ul>;
}

export { statusText };

function evidenceSourceText(source: KnowledgeNode["diagnosticEvidenceSource"]) {
  return source === "child_work" ? "孩子作答原文" : source === "parent" ? "上层节点依据" : "题干原文";
}

function depthLabel(node: KnowledgeNode, depth: number) {
  if (node.kind === "problem") return "目标题目";
  if (node.atomic) return `学习起点 · 第 ${depth} 层前置`;
  return `第 ${depth} 层前置 · 更基础`;
}
