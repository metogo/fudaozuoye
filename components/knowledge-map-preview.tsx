"use client";

import type { LearningSession } from "@/lib/learning/types";
import type { MapFocus } from "@/lib/learning/knowledge-map-preview";
import { ArrowIcon, BookIcon } from "./icons";
import styles from "./knowledge-map-preview.module.css";

export function KnowledgeMapPreview({ session, onOpen }: { session: LearningSession; onOpen: (focus?: MapFocus) => void }) {
  const focus = session.flow.focus;
  const node = focus?.kind === "node" ? session.nodes.find(n => n.id === focus.nodeId && n.kind === "concept") : undefined;
  return <nav className={`knowledge-map-preview ${styles.preview}`} aria-label="本题知识脉络">
    <button type="button" className={`knowledge-map-preview__open ${styles.open}`} aria-label="本题知识图谱" onClick={() => onOpen(node ? { title: node.title } : undefined)}>
      <BookIcon className="h-4 w-4 shrink-0"/><span>查看完整知识图谱</span><ArrowIcon className="ml-auto h-4 w-4 shrink-0"/>
    </button>
  </nav>;
}
