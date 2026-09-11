"use client";

import { createOptionalLearningFeature } from "./optional-learning-feature";
import { useMemo, type ComponentProps } from "react";
import type { ChatMessage, LearningSession } from "@/lib/learning/types";
import { knowledgeGuide } from "@/lib/learning/knowledge-guide";
import type { MapFocus } from "@/lib/learning/knowledge-map-preview";
import { useKnowledgeMap } from "./use-knowledge-map";
import { useUiText } from "./ui-language";
import { ArrowIcon, BookIcon } from "./icons";
import styles from "./conversation-knowledge-map.module.css";
import { ConversationMapPending } from "./conversation-map-pending";

const KnowledgeMapDialog = createOptionalLearningFeature<ComponentProps<typeof import("./problem-knowledge-map").KnowledgeMapDialog>>(() => import("./problem-knowledge-map").then(module => ({ default: module.KnowledgeMapDialog })), "知识图谱");

export function ConversationKnowledgeMap({ session, stateToken, open, focus, onOpen, onClose, messages, hideGuide = false }: {
  session: LearningSession; stateToken: string; open: boolean; focus?: MapFocus;
  messages?: ChatMessage[]; hideGuide?: boolean;
  onOpen: (focus?: MapFocus) => void; onClose: () => void;
}) {
  const t = useUiText();
  const generation = useKnowledgeMap(session, stateToken);
  const { map, plan, root, complete, error, retry } = generation;
  const count = map?.nodes.length ?? 0;
  const total = plan?.nodes.length ?? (complete ? count : null);
  const status = error ? t("生成暂时中断") : complete ? t("已全部生成") : total
    ? t("已生成 {count} / {total} 个知识点", { count, total }) : root ? t("核心知识已识别，正在梳理关联") : t("正在梳理本题知识");
  const core = map?.nodes.find(node => node.id === map.rootId) ?? root;
  const related = map?.nodes.filter(node => node.id !== map.rootId) ?? [];
  const guide = useMemo(() => hideGuide ? null : knowledgeGuide(messages ?? []), [messages, hideGuide]);
  const keywords = core ? [...(guide ? [core] : []), ...related.slice(0, guide ? 1 : 2)] : [];
  return <>
    {!core && !guide && !error ? <ConversationMapPending/> : <section className={`conversation-knowledge-map ${styles.summary}`} aria-label={t("本题知识脉络")}>
      <header className={styles.eyebrow}><BookIcon/><span>{t("本题知识脉络")}</span></header>
      <div className={styles.lead}>
        {guide ? <blockquote className={styles.guide} aria-label={t("摘自本题讲解")}><span>{guide}</span></blockquote>
          : core ? <h2 className={styles.title}><button type="button" className={styles.coreLink} data-knowledge-id={core.id} aria-label={t("查看知识点：{title}", { title: core.title })} onClick={() => onOpen({ id: core.id, title: core.title })}>{core.title}<span aria-hidden="true">↗</span></button></h2>
            : <p className={styles.pendingTitle}>{t(error ? "等待继续整理" : "正在找出核心知识…")}</p>}
      </div>
      <div className={styles.related}>{keywords.length ? <ul aria-label={t("关联知识")}>
        {keywords.map(node => <li key={node.id}><button type="button" data-knowledge-id={node.id} aria-label={t("查看知识点：{title}", { title: node.title })} onClick={() => onOpen({ id: node.id, title: node.title })}>{node.title}<span aria-hidden="true">↗</span></button></li>)}
      </ul> : !complete && !error ? <div className={styles.skeletonKeywords} aria-hidden="true"><span className={styles.skeleton}/><span className={styles.skeleton}/></div> : null}</div>
      <footer className={styles.footer}><button type="button" onClick={() => onOpen()} aria-label={t("展开本题知识图谱")} className={styles.expand}>{t("看看它们怎样关联")}<ArrowIcon/></button><span role="status" className={`${styles.status} ${!complete && !error ? styles.active : ""}`}><i/>{status}</span></footer>
      {error && <div className={styles.error}><p role="alert">{t(error)}</p><button type="button" onClick={retry}>{t("重试生成")}</button></div>}
      {generation.storageNotice && <p className={styles.notice}>{t(generation.storageNotice)}</p>}
    </section>}
    {open && <KnowledgeMapDialog generation={generation} initialFocus={focus} onClose={onClose}/>}
  </>;
}
