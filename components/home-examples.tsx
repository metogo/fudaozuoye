"use client";

import { useRef } from "react";
import { homeExamples } from "@/lib/browser/home-examples";
import { RefreshIcon } from "./icons";
import { useUiText } from "./ui-language";

export function HomeExamples({ disabled, value, onSelect }: { disabled: boolean; value: string; onSelect: (text: string) => void }) {
  const t = useUiText();
  const cursor = useRef(-1);
  function pickNext() {
    if (disabled) return;
    const current = homeExamples.findIndex(example => example.problem === value);
    const next = ((current < 0 ? cursor.current : current) + 1) % homeExamples.length;
    cursor.current = next;
    onSelect(homeExamples[next].problem);
  }
  return <button type="button" disabled={disabled} onClick={pickNext} title={t("换一道示例题")}
    className="home-example-next inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border-0 bg-transparent px-1 text-[12px] font-medium text-[#647b68] shadow-none transition-colors hover:text-[#214f43] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none">
    <RefreshIcon className="h-3.5 w-3.5"/>{t("换一题")}
  </button>;
}
