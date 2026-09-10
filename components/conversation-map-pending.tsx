import { useUiText } from "./ui-language";
import { BookIcon } from "./icons";
import styles from "./conversation-map-pending.module.css";

export function ConversationMapPending() {
  const t = useUiText();
  return <section className={`conversation-map-pending ${styles.summary}`} aria-label={t("本题知识脉络")} aria-busy="true">
    <header className={styles.eyebrow}><BookIcon/><span>{t("本题知识脉络")}</span></header>
    <div className={styles.lead} aria-hidden="true"><span className={`${styles.skeleton} ${styles.skeletonTitle}`}/></div>
    <div className={styles.related} aria-hidden="true"><div className={styles.skeletonKeywords}><span className={styles.skeleton}/><span className={styles.skeleton}/></div></div>
    <div className={styles.footer} aria-hidden="true"><span className={`${styles.skeleton} ${styles.skeletonFooter}`}/></div>
  </section>;
}
