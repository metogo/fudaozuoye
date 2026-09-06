"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import type {
  IllustrationFrame,
  IllustrationLesson,
} from "@/lib/learning/types";
import { RichLearningText } from "./rich-learning-text";
import { TeachingScene } from "./teaching-scene";

interface LearningIllustrationProps {
  lesson: IllustrationLesson | null;
  frames: IllustrationFrame[];
  expectedCount: number;
  busy: boolean;
  loadingLabel: string;
  error: string;
  canClose: boolean;
  onClose: () => void;
  onRegenerate: () => void;
}

// Keep the original error in the caller's request state; show only an actionable
// summary here, never verifier expressions or provider diagnostics.
function illustrationErrorSummary(error: string): string {
  const clarification = /^(?:需要补充条件|请补充条件)[：:]\s*(.+)/.exec(error)?.[1]?.split("（上次核验：")[0].trim();
  if (clarification && !/\b(?:obj\d+|step\d+|JSON|AST)\b/i.test(clarification)) return `还需要确认：${clarification.slice(0, 300)}`;
  if (/超时|timeout|timed out|预算/i.test(error)) return "这次生成用时较长，暂未完成。请稍后重试。";
  if (/识别|条件.*(?:不清|缺|不足)|补充|clarification/i.test(error)) return "题目中的部分条件还不清楚，请返回确认原题是否完整、清晰。";
  if (/网络|连接|fetch|network|429|502|503/i.test(error)) return "暂时无法连接生成服务，请稍后重试。";
  return "这次未能生成可靠的图解，请重试，或返回查看完整讲解。";
}

export function LearningIllustration({
  lesson,
  frames,
  expectedCount,
  busy,
  error,
  canClose,
  onClose,
  onRegenerate,
}: LearningIllustrationProps) {
  const [active, setActive] = useState(0);
  const [brokenFrames, setBrokenFrames] = useState<Set<string>>(
    () => new Set(),
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const visibleFrames = lesson?.frames ?? frames;
  const safeActive = Math.min(active, Math.max(visibleFrames.length - 1, 0));
  const frame = visibleFrames[safeActive];

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => { dialogRef.current?.querySelector("main")?.scrollTo({ top: 0 }); }, [safeActive]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (canClose) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-[#f7f6f2]"
      role="dialog"
      aria-modal="true"
      aria-label="原题分步插画演示"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur-xl">
        <div className="min-w-0">
          <p className="text-[9px] font-bold tracking-[.14em] text-amber-700">
            原题 · 插画演示
          </p>
          <h2 className="mt-1 truncate text-sm font-bold text-stone-900">
            {lesson?.title ?? (busy ? "正在生成分步演示" : "演示暂未完成")}
          </h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          disabled={!canClose}
          onClick={onClose}
          className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold text-stone-500 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-40"
        >
          关闭
        </button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-2xl">
          {frame ? (
            <article className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-[0_18px_50px_rgba(41,37,36,.1)]">
              {(!frame.scene || frame.scene.shapes.length > 0) && <div className="aspect-[4/3] bg-stone-100">
                {frame.scene ? <TeachingScene scene={frame.scene} fallbackUrl={frame.imageUrl} alt={frame.alt} /> : brokenFrames.has(frame.id) ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <p className="text-sm font-semibold text-stone-800">
                      这幅临时图片已失效
                    </p>
                    <p className="mt-2 text-xs text-stone-500">
                      图片暂时无法显示，请重新生成整组插画。
                    </p>
                    <button
                      type="button"
                      onClick={onRegenerate}
                      disabled={busy}
                      className="mt-4 min-h-11 rounded-xl bg-stone-950 px-4 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      重新生成
                    </button>
                  </div>
                ) : (
                  <img
                    src={frame.imageUrl}
                    alt={frame.alt}
                    onError={() =>
                      setBrokenFrames((current) =>
                        new Set(current).add(frame.id),
                      )
                    }
                    className="h-full w-full object-contain"
                  />
                )}
              </div>}
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-stone-950 px-3 py-1 text-[10px] font-bold text-white">
                    步骤 {frame.index}/{lesson?.frameCount ?? expectedCount}
                  </span>
                  <span className="text-[10px] font-medium text-stone-400">
                    题目关系 · 分步演示
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-stone-950">
                  {frame.title}
                </h3>
                {frame.schematic && (!frame.scene || frame.scene.shapes.length > 0) && <p className="mt-2 text-xs text-stone-500">示意图不按比例，请以标注与算式为准。</p>}
                {frame.visualNotes?.map((note, i) => <p key={i} className="mt-2 break-words text-xs leading-5 text-stone-500">{note}</p>)}
                <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-sm leading-7 text-stone-800">
                  {/\$[^$]+\$/.test(frame.calculation) ? <RichLearningText text={frame.calculation} autoMath={false} /> : <p className="whitespace-pre-line">{frame.calculation}</p>}
                </div>
              </div>
            </article>
          ) : (
            <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-[28px] border border-stone-200 bg-white px-6 text-center">
              {busy && <span className="h-9 w-9 animate-pulse rounded-full bg-amber-400" />}
              <h3 className="mt-5 text-base font-bold text-stone-900">
                {busy ? "正在把原题拆成分步图解" : "这次图解暂未完成"}
              </h3>
              <p className="mt-2 text-xs leading-6 text-stone-500">
                {busy ? "用图展示已知条件、推导过程和结果。" : "你可以重试，也可以关闭返回完整讲解。"}
              </p>
            </div>
          )}

          {visibleFrames.length > 0 && (
            <nav className="mt-4" aria-label="插画步骤">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {visibleFrames.map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setActive(index)}
                    aria-current={index === safeActive ? "step" : undefined}
                    className={`min-h-11 min-w-24 rounded-xl px-3 text-xs font-semibold ${index === safeActive ? "bg-stone-950 text-white" : "border border-stone-200 bg-white text-stone-600"}`}
                  >
                    {index + 1}. {item.title}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={safeActive === 0}
                  onClick={() => setActive(Math.max(0, safeActive - 1))}
                  className="min-h-11 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-700 disabled:opacity-30"
                >
                  上一幅
                </button>
                <button
                  type="button"
                  disabled={safeActive >= visibleFrames.length - 1}
                  onClick={() =>
                    setActive(
                      Math.min(visibleFrames.length - 1, safeActive + 1),
                    )
                  }
                  className="min-h-11 rounded-xl bg-stone-950 text-xs font-semibold text-white disabled:opacity-30"
                >
                  下一幅
                </button>
              </div>
            </nav>
          )}

          <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 text-xs leading-6 text-stone-500">
            {busy ? (
              <p role="status">
                {visibleFrames.length > 0 ? "正在完成后续图解…" : "正在准备图解，请稍候…"}
              </p>
            ) : lesson ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="min-h-11 shrink-0 rounded-xl border border-stone-200 px-3 font-semibold text-stone-700"
                >
                  重新生成
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p>图解暂未完成</p>
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="min-h-11 shrink-0 rounded-xl bg-stone-950 px-3 font-semibold text-white"
                >
                  重试
                </button>
              </div>
            )}
            {!busy && !lesson && error && (
              <p className="mt-2 text-red-700" role="alert">
                {illustrationErrorSummary(error)}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
