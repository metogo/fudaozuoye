"use client";

import { useEffect, useState } from "react";
import { parseKnowledgeDetail, type KnowledgeDetail, type MapConcept, type ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";
import { RichLearningText } from "./lazy-rich-learning-text";
import { useUiText } from "./ui-language";
import styles from "./knowledge-explanation.module.css";

/** Keyed by question + concept by the parent. Later graph nodes must not restart this request. */
export function KnowledgeExplanation({ focus: initialFocus, map: initialMap, stateToken, cacheKey, partial: initialPartial }: { focus: MapConcept; map: ProblemKnowledgeMap; stateToken: string; cacheKey: string; partial: boolean }) {
  const t = useUiText();
  const [{ focus, map, partial }] = useState(() => ({ focus: initialFocus, map: initialMap, partial: initialPartial }));
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const key = `${cacheKey}:detail:${focus.id}`;
    const identity = JSON.stringify(map);
    const timer = setTimeout(async () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw && raw.length < 100000) {
          const cached = JSON.parse(raw);
          if (cached.identity === identity) { setDetail(parseKnowledgeDetail(cached.detail)); return; }
        }
      } catch { /* Invalid or unavailable storage cannot block fresh details. */ }
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "/api";
        const response = await fetch(`${base}/learning/knowledge-map`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stateToken, map, nodeId: focus.id, partial }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        const body = await response.json();
        if (!response.ok) throw new Error("详情暂未补充");
        const parsed = parseKnowledgeDetail(body.detail);
        if (controller.signal.aborted) return;
        setDetail(parsed);
        try { localStorage.setItem(key, JSON.stringify({ identity, detail: parsed })); } catch { /* Valid content remains visible without caching. */ }
      } catch { if (!controller.signal.aborted) setError(true); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [focus, map, stateToken, cacheKey, attempt, partial]);
  const content = detail ?? (!map.overviewOnly ? focus : null);
  const pending = !detail && !error;
  return <div className={`knowledge-explanation ${styles.explanation}`} data-state={error ? "error" : pending ? "loading" : "ready"}>
    <div className={styles.status} role={error ? "alert" : "status"}>
      {pending && <span className={`knowledge-detail-spinner ${styles.spinner}`} aria-hidden="true"/>}
      <span>{t(error ? "补充说明暂未加载，仍可浏览图谱。" : pending ? "正在整理知识讲解" : "知识讲解已就绪")}</span>
      {error && <button type="button" className="knowledge-detail-retry" onClick={() => { setError(false); setAttempt(n => n + 1); }}>{t("重试说明")}</button>}
    </div>
    {([ ["summary", "它是什么"], ["application", "本题怎么用"] ] as const).map(([field, label]) => <section key={field} className={`knowledge-detail-section ${styles.section}`} aria-label={t(label)} aria-busy={pending && !content}>
      <h3 className={styles.heading}>{t(label)}</h3>
      <div className={styles.body}>
        {content ? <div className={`knowledge-detail-content ${styles.content}`}><RichLearningText text={content[field]}/></div>
          : error ? <p className={styles.unavailable}>{t("等待重试补充")}</p>
            : <div className={`knowledge-detail-skeleton ${styles.skeleton}`} aria-hidden="true"><i/><i/><i/></div>}
      </div>
    </section>)}
  </div>;
}
