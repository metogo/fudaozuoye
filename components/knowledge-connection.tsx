"use client";

import { useUiText } from "./ui-language";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KnowledgeConnection as Connection } from "@/lib/learning/knowledge-connection";
import type { MapFocus } from "@/lib/learning/knowledge-map-preview";
import { RichLearningText } from "./lazy-rich-learning-text";
import styles from "./knowledge-connection.module.css";
import type { ConnectionEntry } from "./use-knowledge-connections";

export function KnowledgeConnectionSlot({ entry, onOpen, onRetry }: { entry: ConnectionEntry; onOpen: (focus?: MapFocus) => void; onRetry: () => void }) {
  const t = useUiText();
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = slot.current, scroll = node?.closest<HTMLElement>(".chat-scroll");
    if (!node || !scroll || typeof ResizeObserver === "undefined") return;
    let height = node.getBoundingClientRect().height, status = node.dataset.status;
    const observer = new ResizeObserver(() => {
      const nextHeight = node.getBoundingClientRect().height, delta = nextHeight - height;
      // Preserve the visible task controls when optional content arrives above them.
      // User-initiated expansion is deliberately not auto-scrolled.
      if (status === "pending" && node.dataset.status !== "pending") {
        const wasAtBottom = scroll.scrollHeight - delta - scroll.scrollTop - scroll.clientHeight < 80;
        const wasAbove = node.getBoundingClientRect().bottom - delta < scroll.getBoundingClientRect().top;
        if (wasAtBottom || wasAbove) scroll.scrollTop += delta;
      }
      height = nextHeight; status = node.dataset.status;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={slot} className="knowledge-connection-slot" data-status={entry.status}>
    {entry.status === "pending" ? <div className={`knowledge-connection-pending ${styles.notice}`} role="status">{t("正在整理知识连接 · 不影响继续学习")}</div>
      : entry.status === "error" ? <div className={`knowledge-connection-error ${styles.notice}`}><span>{t("知识连接暂未整理成功")}</span><button type="button" className={styles.more} onClick={onRetry}>{t("重试知识连接")}</button></div>
        : entry.connection ? <KnowledgeConnection connection={entry.connection} onOpen={onOpen}/> : null}
  </div>;
}

export function KnowledgeConnection({ connection, onOpen }: { connection: Connection; onOpen: (focus?: MapFocus) => void }) {
  const t = useUiText();
  const [selected, setSelected] = useState<string | null>(null);
  const detailId = useId();
  const nodes = [connection.foundation, connection.target];
  const active = nodes.find(n => n.title === selected);
  return <aside className={`knowledge-connection ${styles.connection}`} aria-label={t("本段知识连接")}>
    <p className={styles.eyebrow}>{t("把知识连起来")}</p>
    <div className={styles.pair}>
      {nodes.map((node, i) => <span className={styles.item} key={node.title}>
        {i === 1 && <span className={styles.arrow} aria-label={connection.kind === "prerequisite" ? t("帮助理解") : t("结合使用")}>{connection.kind === "prerequisite" ? "→" : "↔"}</span>}
        <button type="button" className={`knowledge-connection__concept ${styles.concept}`} aria-expanded={selected === node.title} aria-controls={selected === node.title ? detailId : undefined} onClick={() => setSelected(selected === node.title ? null : node.title)}><RichLearningText text={node.title} compact/><span aria-hidden="true">{selected === node.title ? "−" : "+"}</span></button>
      </span>)}
    </div>
    <div className={styles.reason}><RichLearningText text={connection.reason} compact/></div>
    <p className={styles.hint}>{t("点知识点，展开看看")}</p>
    {active && <div id={detailId} role="region" aria-label={t("{title}的就地讲解", { title: active.title })} className={`knowledge-connection__detail ${styles.detail}`}>
      <RichLearningText text={active.explanation}/>
      {active.example && <div className={styles.example}><strong>{t("看个例子")}</strong><RichLearningText text={active.example}/></div>}
      <details className={`knowledge-connection__source ${styles.source}`}><summary>{t("对应哪段讲解")}</summary><blockquote>{connection.anchor}</blockquote></details>
      <button type="button" className={styles.more} onClick={() => onOpen({ title: active.title })}>{t("在完整图谱中查看 →")}</button>
    </div>}
  </aside>;
}
