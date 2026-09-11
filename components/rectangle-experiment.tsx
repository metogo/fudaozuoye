"use client";

import { useId, useRef, useState } from "react";
import { experimentObservationLimit, experimentQuestion, experimentStart, rectangleMetrics, resizeRectangle } from "@/lib/learning/rectangle-experiment";
import { useUiText } from "./ui-language";
import styles from "./rectangle-experiment.module.css";

export function RectangleExperiment({ disabled, onAsk }: { disabled: boolean; onAsk: (text: string) => void }) {
  const t = useUiText();
  const id = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const [rectangle, setRectangle] = useState(experimentStart);
  const [baseline, setBaseline] = useState(experimentStart);
  const [fixedSum, setFixedSum] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const sent = useRef(false);
  const metrics = rectangleMetrics(rectangle), previous = rectangleMetrics(baseline);
  const changed = rectangle.length !== baseline.length || rectangle.width !== baseline.width;
  const fixedAtBoundary = fixedSum !== null && Math.ceil(fixedSum / 2) === Math.min(8, fixedSum - 1);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  const reset = () => { setRectangle(experimentStart); setBaseline(experimentStart); setFixedSum(null); setQuestion(""); };
  const toggleConstraint = () => { setBaseline(rectangle); setFixedSum(fixedSum === null ? rectangle.length + rectangle.width : null); };
  const ask = () => {
    if (disabled || sent.current || !changed) return;
    sent.current = true;
    close();
    onAsk(experimentQuestion(baseline, rectangle, fixedSum, question));
  };
  return <section data-selection-exclude className={`rectangle-experiment ${styles.experiment}`} aria-label={t("长方形知识小实验")}>
    <button ref={trigger} type="button" className={`experiment-trigger ${styles.trigger}`} disabled={disabled} aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => { if (open) close(); else { sent.current = false; setOpen(true); } }}>
      <span className={styles.symbol} aria-hidden="true"><svg viewBox="0 0 40 32"><rect x="5" y="8" width="24" height="17" rx="2"/><path d="M33 4v8M29 8h8"/></svg></span>
      <span><small>{t("换个方式理解")}</small><strong>{t("拖一拖，看看周长和面积")}</strong></span><span className={styles.expand} aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <div id={`${id}-panel`} className={`experiment-panel ${styles.panel}`} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <p className={styles.boundary}>{t("独立知识实验 · 不是原题配图，数值不用于原题作答")}</p>
      <div className={styles.mode}><button type="button" aria-pressed={fixedSum !== null} disabled={disabled} onClick={toggleConstraint}>{t("保持周长不变")}<span aria-hidden="true">{fixedSum === null ? "○" : "●"}</span></button><button type="button" disabled={disabled} onClick={reset}>{t("重新观察")}</button></div>
      <p className={styles.prompt}>{t(fixedSum === null ? "先改变一条边，观察边界和铺满图形的小方格。" : fixedAtBoundary ? "当前整数范围内只有这一种形状。解除固定或重新观察，即可继续。" : "周长已固定。改变长，看看宽和面积怎样变化。")}</p>
      <svg className={`experiment-canvas ${styles.canvas}`} viewBox="0 0 300 250" role="img" aria-label={t("实验长方形：长 {length} 厘米，宽 {width} 厘米", rectangle)}>
        <defs><pattern id={`${id}-grid`} width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#87aa9960" strokeWidth="1"/></pattern></defs>
        <rect x="54" y="36" width="192" height="192" rx="6" fill="#edf4ee"/>
        <g transform="translate(54 36)"><rect className="experiment-shape" width={rectangle.length * 24} height={rectangle.width * 24} fill="#d6e8d9"/><rect width={rectangle.length * 24} height={rectangle.width * 24} fill={`url(#${id}-grid)`} stroke="#fdc235" strokeWidth="3"/></g>
        {changed && <rect x="54" y="36" width={baseline.length * 24} height={baseline.width * 24} fill="none" stroke="#738c7e" strokeDasharray="4 4"/>}
        <text x={54 + rectangle.length * 12} y="24" textAnchor="middle" fill="#285844" fontSize="13">{rectangle.length} cm</text>
        <text x="42" y={40 + rectangle.width * 12} textAnchor="end" fill="#285844" fontSize="13">{rectangle.width}</text>
      </svg>
      <p className={styles.legend}>{t("每个小方格是 1 平方厘米 · 虚线为本轮起点")}</p>
      <div className={styles.controls}>
        <label><span>{t("长")}<b>{rectangle.length} cm</b></span><input aria-label={t("实验长方形的长")} type="range" min={fixedSum === null ? rectangle.width : Math.ceil(fixedSum / 2)} max={fixedSum === null ? 8 : Math.min(8, fixedSum - 1)} step="1" value={rectangle.length} disabled={disabled} onChange={event => setRectangle(resizeRectangle(rectangle, "length", Number(event.target.value), fixedSum))}/></label>
        <label><span>{t("宽")}<b>{rectangle.width} cm {fixedSum !== null && <small>{t("随长自动变化")}</small>}</b></span><input aria-label={t("实验长方形的宽")} type="range" min="1" max={rectangle.length} step="1" value={rectangle.width} disabled={disabled || fixedSum !== null} onChange={event => setRectangle(resizeRectangle(rectangle, "width", Number(event.target.value), null))}/></label>
      </div>
      <div className={`experiment-results ${styles.results}`} aria-live="polite" aria-atomic="true">
        <div><span>{t("周长 · 边界一圈")}</span><strong>{metrics.perimeter}<small> cm</small></strong><p>2 × ({rectangle.length} + {rectangle.width})</p><small>{t("本轮起点：{value}", { value: `${previous.perimeter} cm` })}</small></div>
        <div><span>{t("面积 · 方格总数")}</span><strong>{metrics.area}<small> cm²</small></strong><p>{rectangle.length} × {rectangle.width}</p><small>{t("本轮起点：{value}", { value: `${previous.area} cm²` })}</small></div>
      </div>
      <form className={styles.ask} onSubmit={event => { event.preventDefault(); ask(); }}>
        <label htmlFor={`${id}-question`}>{t("你发现了什么？")}</label>
        <textarea id={`${id}-question`} disabled={disabled} maxLength={experimentObservationLimit} rows={2} value={question} onChange={event => setQuestion(event.target.value)} placeholder={t("可以写下发现或疑问，也可以直接问这个变化的原因…")}/>
        <small className={styles.counter}>{question.length} / {experimentObservationLimit}</small>
        <p>{t(changed ? "会带上本轮前后的数值，接着原题讨论；不会提交为答案。" : "先拖动滑块改变图形，再带着观察回到原题。")}</p>
        <button type="submit" disabled={disabled || !changed}>{t("带着观察问小逗号")} <span aria-hidden="true">↗</span></button>
        <button type="button" className={styles.back} onClick={close}>{t("收起实验，继续看题")}</button>
      </form>
    </div>}
  </section>;
}
