import styles from "./problem-knowledge-map.module.css";

export function KnowledgeMapProgress({ count, total, complete, error, latest, retry }: {
  count: number; total: number | null; complete: boolean; error: string; latest?: string; retry: () => void;
}) {
  const label = error ? "生成暂时中断" : complete ? "已全部生成" : total && count === total ? "正在确认知识关系" : total ? "知识正在连起来" : "正在梳理本题知识";
  return <div className={`knowledge-map-progress ${styles.progress} ${error ? styles.progressError : ""}`}>
    <div className={styles.progressHeading}><span className={styles.progressLabel}><i className={!complete && !error ? styles.breathing : undefined}/>{label}</span>
      <span className={styles.progressCount}>{total ? <><strong>{count}</strong><span> / {total} 个知识点</span></> : "从本题核心开始"}</span>
    </div>
    <div className={styles.progressTrack} role="progressbar" aria-label="知识点生成进度" aria-valuemin={0} aria-valuemax={total ?? undefined} aria-valuenow={total ? count : undefined} aria-valuetext={total ? `已生成 ${count} / ${total} 个知识点${error ? "，生成中断" : ""}` : "正在确定知识清单"}>
      <div style={{ width: total ? `${count / total * 100}%` : "0%" }}/>
    </div>
    <div className={styles.progressCaption} role="status" aria-live="polite" aria-atomic="true">
      {error ? <><span role="alert">{error}</span><button onClick={retry}>重试生成</button></> : <span>{complete ? "点击知识点，看看它在本题中怎么用" : latest ? `已生成 ${count} / ${total} · ${latest}` : total ? "清单已确定，正在整理根节点" : "画布已就绪，知识点会陆续出现"}</span>}
    </div>
  </div>;
}
