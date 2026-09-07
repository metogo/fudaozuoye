"use client";

import { useUiText } from "./ui-language";
import { useEffect, useState } from "react";
import { thinkingPresentation } from "@/lib/learning/thinking-presentation";
import { loadingLearningQuotes } from "@/lib/learning/quotes";
import { CommaCompanion } from "./comma-companion";
import styles from "./chat-thinking.module.css";

export function ChatThinking({ active, label }: { active: boolean; label: string }) {
  const t = useUiText();
  const [previousActive, setPreviousActive] = useState(active);
  const [exiting, setExiting] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  if (previousActive !== active) {
    setPreviousActive(active);
    setExiting(!active);
    if (active) setQuoteIndex(index => (index + 1) % loadingLearningQuotes.length);
  }
  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => setExiting(false), 180);
    return () => window.clearTimeout(timer);
  }, [exiting]);
  const content = thinkingPresentation(label);
  const quote = loadingLearningQuotes[quoteIndex];
  if (!active && !exiting) return null;
  return <div className={styles.shell} data-exiting={exiting} aria-hidden={!active}><div className={styles.clip}>
      <div className={styles.content} role="status" aria-live="polite" aria-atomic="true" aria-label={t("小逗号正在思考")}>
        <div className={styles.avatar} aria-hidden="true"><CommaCompanion thinking canCelebrate={false}/></div>
        <div className={styles.copy}><div className={styles.eyebrow}>{t("小逗号正在思考")}<span className={styles.dots} aria-hidden="true"><i/><i/><i/></span></div><div key={t(content.title)} className={styles.phase}><h3>{t(content.title)}</h3><p>{t(content.description)}</p></div><blockquote className={styles.quote} aria-label={t("学习寄语")} aria-live="off"><p>“{t(quote.text)}”</p><cite>— {t(quote.source)}</cite></blockquote></div>
      </div>
    </div></div>;
}
