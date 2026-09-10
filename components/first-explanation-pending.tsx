import { useUiText } from "./ui-language";
import { thinkingPresentation } from "@/lib/learning/thinking-presentation";
import styles from "./first-explanation-pending.module.css";

/** The stream announces a section heading before the model sends its first body token. */
export function hasExplanationBody(text: string): boolean {
  return text.replace(/^\s*#{1,6}(?:[ \t]+[^\n]*)?(?:\n|$)/, "").trim().length > 0;
}

/** This occupies the first explanation's reading position, not a separate loading card. */
export function FirstExplanationPending({ label, text = "" }: { label: string; text?: string }) {
  const t = useUiText();
  // The server's real section heading is useful feedback even before model tokens arrive.
  const heading = text.match(/^\s*#{1,6}[ \t]+([^\n]+)/)?.[1].trim();
  const title = heading || thinkingPresentation(label === "正在继续讲解" ? "正在准备讲解" : label).title;
  return <section className={`first-explanation-pending ${styles.reading}`} role="status" aria-live="polite" aria-atomic="true" aria-label={t("小逗号正在思考")}>
    <div className={styles.byline}><span className={styles.pulse} aria-hidden="true"/>{t("小逗号正在思考")}</div>
    <h3 className={styles.title}>{t(title)}</h3>
    <div className={styles.lines} aria-hidden="true"><span/><span/><span/></div>
  </section>;
}
