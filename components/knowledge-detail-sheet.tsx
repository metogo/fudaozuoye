"use client";

import { useId, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { useUiText } from "./ui-language";
import { useKnowledgeSheetDrag } from "./use-knowledge-sheet-drag";
import styles from "./problem-knowledge-map.module.css";

export function KnowledgeDetailSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useUiText();
  const id = useId();
  const { slot, height, expanded, dragging, handleProps } = useKnowledgeSheetDrag();
  return <div ref={slot} className={`knowledge-detail-slot ${styles.detailSlot}`}>
    <section className={`knowledge-detail-sheet ${styles.detail}`} style={{ height }} data-dragging={dragging} data-expanded={expanded} aria-label={t("{title}的知识说明", { title })}>
      <button type="button" className={`knowledge-detail-drag-handle ${styles.detailHandle}`} {...handleProps} aria-label={t(expanded ? "收回知识卡片" : "展开知识卡片")} aria-expanded={expanded} aria-controls={id}>
        <i aria-hidden="true"/><span>{t(expanded ? "下拉收回" : "上拉展开")}</span>
      </button>
      <header><div><span>{t("知识卡片")}</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label={t("关闭知识卡片")}><CloseIcon/></button></header>
      <div id={id} className={styles.detailBody}>{children}</div>
    </section>
  </div>;
}
