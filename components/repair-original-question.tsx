"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ProblemSnapshot } from "@/lib/learning/types";
import { hasDamagedFormula } from "@/lib/learning/formula-integrity";
import { loadQuestionImage } from "@/lib/browser/question-image-store";
import { useUiText } from "./ui-language";

/** Recover from the authoritative photo, never infer missing TeX characters. */
export function RepairOriginalQuestion({ message, problem, busy, onFile }: {
  message: ChatMessage; problem?: ProblemSnapshot; busy: boolean;
  onFile: (file: File, replaceProblem?: boolean) => void;
}) {
  const t = useUiText();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const active = useRef(true);
  const running = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const damaged = problem && [problem.text, problem.visualContext?.summary, ...(problem.visualContext?.facts.map(f => f.text) ?? [])].some(text => text && hasDamagedFormula(text));
  if (!damaged) return null;
  const recover = async () => {
    if (busy || running.current) return;
    running.current = true; setLoading(true); setError("");
    try {
      let blob: Blob | null = null;
      if (message.imageUrl?.startsWith("blob:") || message.imageUrl?.startsWith("data:image/")) {
        try {
          const response = await fetch(message.imageUrl, { signal: AbortSignal.timeout(5000) });
          if (response.ok) blob = await response.blob();
        } catch { /* A revoked preview can still have an intact persisted original. */ }
      }
      if ((!blob?.size || !blob.type.startsWith("image/")) && message.imageAssetId) blob = await loadQuestionImage(message.imageAssetId);
      if (!blob?.size || !blob.type.startsWith("image/")) throw new Error(t("原图不可用，请重新上传原图；当前对话未改动。"));
      if (!active.current) return;
      const file = new File([blob], "original-question", { type: blob.type });
      // Cropping and image decoding can still fail or be cancelled. Commit only
      // after the cropper returns a usable image, not when opening it.
      onFile(file, true);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : t("原图读取失败，请重新上传原图。"));
    } finally { running.current = false; if (active.current) setLoading(false); }
  };
  return <aside className="repair-original-question my-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-stone-700">
    <p>{t("已保存的题目公式损坏，请用原图重新识别。旧讲解可能受影响，请勿据此计算。")}</p>
    {confirming ? <div className="repair-original-confirm mt-3" role="group" aria-label={t("确认重新识别")}>
      <p>{t("重新识别将重置本题学习进度，并重新生成讲解和知识图谱。")}</p>
      <button type="button" disabled={busy || loading} onClick={() => void recover()} className="repair-original-action mt-3 rounded-full bg-emerald-900 px-4 py-2 text-white disabled:opacity-50">{t(loading ? "正在读取原图…" : "确认重新识别")}</button>
      <button type="button" disabled={loading} onClick={() => setConfirming(false)} className="repair-original-cancel ml-3 px-3 py-2">{t("取消")}</button>
    </div> : <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="repair-original-action mt-3 rounded-full bg-emerald-900 px-4 py-2 text-white disabled:opacity-50">{t("用原图重新识别")}</button>}
    {error && <p role="alert" className="repair-original-error mt-2">{error}</p>}
  </aside>;
}
