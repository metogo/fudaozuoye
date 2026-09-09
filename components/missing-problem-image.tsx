"use client";

import type { ProblemSnapshot } from "@/lib/learning/types";
import type { ChangeEventHandler } from "react";
import { RichLearningText } from "./lazy-rich-learning-text";
import { useUiText } from "./ui-language";

export function MissingProblemImage({ problem, onFileChange, busy }: {
  problem: ProblemSnapshot; onFileChange: ChangeEventHandler<HTMLInputElement>; busy: boolean;
}) {
  const t = useUiText();
  return <section className="missing-problem-image rounded-3xl border border-amber-200 bg-amber-50/70 p-5" aria-label={t("请补充题目配图")}>
    <h2 className="text-base font-semibold text-stone-800">{t("文字已读懂，还需要补一张图")}</h2>
    <p className="mt-2 text-sm leading-6 text-stone-600">{t("以下条件没有拍到，补齐后才能准确讲解。已识别的文字会保留。")}</p>
    <ul className="missing-problem-image__conditions mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-stone-800">
      {problem.missingVisualInformation?.map(item => <li key={item}>{item}</li>)}
    </ul>
    <label className={`missing-problem-image__upload mt-4 flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-emerald-900 px-4 text-sm font-semibold text-white ${busy ? "pointer-events-none opacity-50" : ""}`}>
      {t("补拍或上传完整题目和配图")}
      <input type="file" accept="image/*" disabled={busy} aria-label={t("补拍或上传完整题目和配图")} className="sr-only" onChange={onFileChange}/>
    </label>
    <details className="missing-problem-image__recognized mt-4 border-t border-amber-200 pt-3 text-sm leading-6 text-stone-600">
      <summary className="cursor-pointer">{t("查看已识别文字")}</summary>
      <div className="mt-3"><RichLearningText text={problem.text}/></div>
    </details>
  </section>;
}
