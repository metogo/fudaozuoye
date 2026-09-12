"use client";

import { useEffect, useRef, useState } from "react";
import { createQuestionEntryReporter, QUESTION_STATISTICS_CHANGED, statisticsUrl } from "@/lib/learning/question-count-client";

export function useQuestionEntryReporting(ready: boolean, questionEpoch: number) {
  const recordedEpoch = useRef<number | null>(null);
  const [reporter] = useState(() => createQuestionEntryReporter({
    storage: () => sessionStorage,
    warn: () => console.warn("[question-statistics] reporting pending; learning is unaffected"),
    send: async submissionId => {
      const response = await fetch(statisticsUrl(), {
        method: "POST", credentials: "include", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("统计暂不可用");
      const result = await response.json() as { total?: unknown; counted?: unknown };
      if (typeof result.counted !== "boolean" || typeof result.total !== "number" || !Number.isSafeInteger(result.total) || result.total < 0) throw new Error("统计结果无效");
      window.dispatchEvent(new Event(QUESTION_STATISTICS_CHANGED));
    },
  }));
  useEffect(() => {
    if (!ready) return;
    reporter.start();
    window.addEventListener("online", reporter.resume);
    return () => {
      reporter.stop();
      window.removeEventListener("online", reporter.resume);
    };
  }, [ready, reporter]);
  return () => {
    if (recordedEpoch.current === questionEpoch) return;
    recordedEpoch.current = questionEpoch;
    reporter.enqueue();
  };
}
