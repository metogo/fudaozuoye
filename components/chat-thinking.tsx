"use client";

import { useUiText } from "./ui-language";
import { useEffect, useState } from "react";
import { thinkingPresentation } from "@/lib/learning/thinking-presentation";
import { CommaCompanion } from "./comma-companion";
import styles from "./chat-thinking.module.css";

export function ChatThinking({ active, label }: { active: boolean; label: string }) {
  const t = useUiText();
  const [previousActive, setPreviousActive] = useState(active);
  const [exiting, setExiting] = useState(false);
  if (previousActive !== active) {
    setPreviousActive(active);
    setExiting(!active);
  }
  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => setExiting(false), 180);
    return () => window.clearTimeout(timer);
  }, [exiting]);
  const content = thinkingPresentation(label);
  if (!active && !exiting) return null;
  return <div className={`chat-thinking ${styles.shell}`} data-exiting={exiting} aria-hidden={!active}><div className={styles.clip}>
      <div className={`chat-thinking-card ${styles.card} relative isolate w-full max-w-[420px] rounded-[24px] border border-[#e1eae3] px-5 pt-5 pb-6 sm:px-6`} role="status" aria-live="polite" aria-atomic="true" aria-label={t("小逗号正在思考")}>
        <svg className={`chat-thinking-border ${styles.border}`} aria-hidden="true" focusable="false">
          <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="23" pathLength="100"/>
        </svg>
        <div className="chat-thinking-header mb-3 flex min-h-10 items-center justify-between gap-4">
          <div className="chat-thinking-byline flex min-w-0 items-center gap-2 text-[11px] leading-5 tracking-[.04em] text-[#697a70]">
            <span className={`chat-thinking-pulse ${styles.pulse}`} aria-hidden="true"/>
            <span>{t("小逗号正在思考")}</span>
          </div>
          <div className={`chat-thinking-avatar ${styles.avatar}`} aria-hidden="true"><CommaCompanion thinking canCelebrate={false}/></div>
        </div>
        <div className="chat-thinking-copy min-w-0">
          <div key={t(content.title)} className={styles.phase}>
            <h3 className="chat-thinking-title m-0 text-[20px] leading-[1.5] font-semibold tracking-[-.025em] text-[#294b3d] [overflow-wrap:anywhere]">{t(content.title)}</h3>
            <p className="chat-thinking-description mt-2 mb-0 text-[13px] leading-[1.8] text-[#697a70] [text-wrap:pretty] [overflow-wrap:anywhere]">{t(content.description)}</p>
          </div>
        </div>
      </div>
    </div></div>;
}
