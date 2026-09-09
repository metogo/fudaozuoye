"use client";

import { useUiText } from "./ui-language";
import type { LearningSession } from "@/lib/learning/types";
import type { MapFocus } from "@/lib/learning/knowledge-map-preview";
import { BookIcon } from "./icons";
import styles from "./knowledge-map-preview.module.css";

export function KnowledgeMapPreview({ session, onOpen }: { session: LearningSession; onOpen: (focus?: MapFocus) => void }) {
  const t = useUiText();
  const focus = session.flow.focus;
  const node = focus?.kind === "node" ? session.nodes.find(n => n.id === focus.nodeId && n.kind === "concept") : undefined;
  return <button type="button" className={`knowledge-map-preview knowledge-map-preview__open ${styles.open}`} aria-label={t("本题知识图谱")} onClick={() => onOpen(node ? { title: node.title } : undefined)}>
    <BookIcon className="gate-action-icon h-4 w-4 shrink-0"/><span>{t("查看完整知识图谱")}</span>
  </button>;
}
