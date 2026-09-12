"use client";

import { useEffect, useState } from "react";
import { readQuestionTotal, QUESTION_STATISTICS_CHANGED } from "@/lib/learning/question-count-client";
import { useUiText } from "./ui-language";

export function HomeQuestionCount({ active }: { active: boolean }) {
  const t = useUiText();
  const [total, setTotal] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let request: AbortController | undefined;
    let lastFocusRefresh = 0;
    const refresh = () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      void readQuestionTotal(AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]))
        .then(count => { if (!disposed && request === controller) { setTotal(count); setUnavailable(false); } })
        .catch(() => { if (!disposed && !controller.signal.aborted) { setTotal(null); setUnavailable(true); } });
    };
    refresh();
    const refreshOnFocus = () => {
      if (Date.now() - lastFocusRefresh < 60_000) return;
      lastFocusRefresh = Date.now();
      refresh();
    };
    lastFocusRefresh = Date.now();
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("online", refresh);
    window.addEventListener(QUESTION_STATISTICS_CHANGED, refresh);
    return () => {
      disposed = true; request?.abort();
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("online", refresh);
      window.removeEventListener(QUESTION_STATISTICS_CHANGED, refresh);
    };
  }, [active]);
  const formatted = total?.toLocaleString("en-US");
  const [prefix, suffix] = t("已累计解题 {count} 次").split("{count}");
  const loading = total === null && !unavailable;
  return <p className="home-question-count mt-6 flex min-h-10 max-w-full items-center text-[#6a7165]" role="status" aria-live="polite" aria-atomic="true" aria-busy={loading}>
    {formatted !== undefined ? <>
      <span className="sr-only">{t("已累计解题 {count} 次", { count: formatted })}</span>
      <span aria-hidden="true" className="home-question-count-content flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        {prefix.trim() && <span className="home-question-count-label text-sm leading-6">{prefix.trim()}</span>}
        <strong className="home-question-count-value relative isolate min-w-0 px-0.5 font-serif text-[30px] leading-9 font-medium tracking-[-.03em] text-[#28513d] italic tabular-nums [overflow-wrap:anywhere]">
          {formatted}
          <span className="home-question-count-underline pointer-events-none absolute right-0 -bottom-0.5 left-0 h-2 -rotate-3 rounded-[50%] border-b-[3px] border-[#d5ad58]/80"/>
        </strong>
        <span className="home-question-count-unit text-sm leading-6">{suffix.trim()}</span>
      </span>
    </> : unavailable ? <span className="home-question-count-unavailable text-[13px] leading-5">{t("统计暂不可用")}</span> : <>
      <span className="sr-only">{t("正在读取解题次数")}</span>
      <span aria-hidden="true" className="home-question-count-loading h-5 w-40 max-w-full rounded bg-[#e7e8de] motion-safe:animate-pulse"/>
    </>}
  </p>;
}
