"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { MapConcept } from "@/lib/learning/knowledge-map";
import { useUiText } from "./ui-language";
import { RichLearningText } from "./lazy-rich-learning-text";
import { MapActivityDots, MapRootContinuation } from "./knowledge-map-activity";
import styles from "./problem-knowledge-map.module.css";

export type ConceptNode = Node<{ concept: MapConcept; root: boolean; expanded: boolean; childCount: number; dimmed: boolean; pending?: boolean; preview?: boolean; continuing?: boolean; stopped?: boolean; toggle: (id: string) => void }, "concept">;
const Concept = memo(function Concept({ id, data, selected }: NodeProps<ConceptNode>) {
  const t = useUiText();
  if (data.pending) return <div key="pending" className={`knowledge-map-pending ${styles.node} ${styles.pendingNode}`} data-stopped={Boolean(data.stopped)} aria-label={data.stopped ? t("等待继续整理") : data.root ? t("正在整理本题核心") : t("正在补充知识点")}>
    <Handle type="target" position={Position.Top} isConnectable={false}/>
    <span className={styles.nodeLabel}>{data.root ? t("本题核心") : t("下一个知识点")}{!data.stopped && <MapActivityDots/>}</span>
    <strong>{data.stopped ? t("等待继续整理") : data.root ? t("正在整理本题核心") : t("正在连接知识…")}</strong>
    <span className={styles.skeletonLines} aria-hidden="true"><i/><i/></span>
  </div>;
  return <div className="knowledge-map-concept" style={{ position: "relative" }}>
    <div key="ready" className={`${styles.node} ${data.root ? styles.core : ""} ${selected ? styles.selected : ""} ${data.dimmed ? styles.dimmed : ""}`}>
      <Handle type="target" position={Position.Top} isConnectable={false}/>
      <span className={styles.nodeLabel}>{data.root ? t("本题核心") : t("关联知识")}<span aria-hidden="true">⠿</span></span>
      <strong><RichLearningText text={data.concept.title} compact/></strong>
      {data.childCount > 0 ? <button className={`nodrag nopan ${styles.expand}`} onClick={(e) => { e.stopPropagation(); data.toggle(id); }} aria-expanded={data.expanded} aria-label={t(data.expanded ? "收起{title}的基础知识" : "展开{title}的基础知识", { title: data.concept.title })}>{data.expanded ? t("收起基础") : t("展开 {count} 个基础", { count: data.childCount })}<span aria-hidden="true">{data.expanded ? "−" : "+"}</span></button> : <span className={styles.leaf}>{t(data.preview ? "正在梳理关联知识" : "点击了解它在本题的作用")}</span>}
      <Handle type="source" position={Position.Bottom} isConnectable={false}/>
    </div>
    {data.continuing && !data.stopped && <MapRootContinuation/>}
  </div>;
});

export const knowledgeMapNodeTypes = { concept: Concept };
