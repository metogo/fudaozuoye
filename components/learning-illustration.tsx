"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import type {
  IllustrationFrame,
  IllustrationLesson,
} from "@/lib/learning/types";
import { RichLearningText } from "./rich-learning-text";

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

export function LearningIllustration({
  lesson,
  frames,
  expectedCount,
  busy,
  loadingLabel,
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
            {lesson?.title ?? "正在生成连续分镜"}
          </h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          disabled={!canClose}
          onClick={onClose}
          className="min-h-11 rounded-xl px-3 text-xs font-semibold text-stone-500 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-40"
        >
          关闭
        </button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-2xl">
          {frame ? (
            <article className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-[0_18px_50px_rgba(41,37,36,.1)]">
              <div className="aspect-[4/3] bg-stone-100">
                {brokenFrames.has(frame.id) ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <p className="text-sm font-semibold text-stone-800">
                      这幅临时图片已失效
                    </p>
                    <p className="mt-2 text-xs text-stone-500">
                      演算文字仍然可靠，可以重新生成整组插画。
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
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-stone-950 px-3 py-1 text-[10px] font-bold text-white">
                    步骤 {frame.index}/{lesson?.frameCount ?? expectedCount}
                  </span>
                  <span className="text-[10px] font-medium text-stone-400">
                    AI 插画 · 演算以文字为准
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-stone-950">
                  {frame.title}
                </h3>
                <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-sm leading-7 text-stone-800">
                  <RichLearningText text={frame.calculation} />
                </div>
                <p className="mt-3 text-xs leading-6 text-stone-500">
                  <span className="font-semibold text-stone-700">
                    步骤承接：
                  </span>
                  {frame.transition}
                </p>
              </div>
            </article>
          ) : (
            <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-[28px] border border-stone-200 bg-white px-6 text-center">
              <span className="h-9 w-9 animate-pulse rounded-full bg-amber-400" />
              <h3 className="mt-5 text-base font-bold text-stone-900">
                正在判断这道题需要几幅插画
              </h3>
              <p className="mt-2 text-xs leading-6 text-stone-500">
                {loadingLabel || "模型会按有效演算步骤决定，不会为凑数量拆分。"}
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
                {loadingLabel ||
                  `正在生成 ${visibleFrames.length + 1}/${expectedCount || "?"} 幅插画`}
              </p>
            ) : lesson ? (
              <div className="flex items-center justify-between gap-3">
                <p>本页会复用这组插画，不会重复调用模型。</p>
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
                <p>生成未完整完成，学习状态没有改变。</p>
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
                {error}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
