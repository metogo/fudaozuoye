"use client";

import { useUiText } from "./ui-language";
import styles from "./knowledge-map-activity.module.css";

export function MapActivityDots() {
  return <span className={styles.dots} aria-hidden="true"><i/><i/><i/></span>;
}

/** An activity illustration, not a predicted concept or a graph edge. */
export function MapRootContinuation() {
  const t = useUiText();
  return <div className={`knowledge-map-continuation ${styles.continuation}`} aria-hidden="true">
    <span className={styles.trail}/>
    <div className={styles.waiting}><MapActivityDots/><strong>{t("正在展开关联知识")}</strong><span>{t("知识点会陆续出现")}</span></div>
  </div>;
}

/** Remains in view when users pan away from the pending slot. */
export function KnowledgeMapActivity({ active, count, total }: { active: boolean; count: number; total: number | null }) {
  const t = useUiText();
  if (!active) return null;
  return <div className={`knowledge-map-canvas-activity ${styles.status}`} aria-hidden="true">
    <MapActivityDots/>
    <span><strong>{t(total && count === total ? "正在确认知识关系" : "图谱还在展开")}</strong>
      <span key={count} className={styles.count}>{total ? t("已生成 {count} / {total} 个知识点", { count, total }) : t("知识点会陆续出现")}</span>
    </span>
  </div>;
}
