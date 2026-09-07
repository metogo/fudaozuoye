"use client";

import { useUiText } from "./ui-language";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, RefreshIcon, RedoIcon, ZoomIcon } from "./icons";

export interface Crop { x: number; y: number; width: number; height: number }
type CropHandle = "north-west" | "north-east" | "south-west" | "south-east";
type Drag =
  | { mode: "move"; startX: number; startY: number; initial: Crop }
  | { mode: "resize"; handle: CropHandle; startX: number; startY: number; initial: Crop };

// Never discard question text before the user explicitly chooses a smaller region.
const initialCrop: Crop = { x: 0, y: 0, width: 100, height: 100 };
const minimumCropWidth = 15;
const minimumCropHeight = 12;

export function ImageCropper({ file, onConfirm, onCancel, title = "只保留一道题", hint = "拖动框移动，拖四角调整范围", confirmLabel = "裁剪并识别" }: { file: File; onConfirm: (blob: Blob, previewUrl: string) => void; onCancel: () => void; title?: string; hint?: string; confirmLabel?: string }) {
  const t = useUiText();
  const [url, setUrl] = useState("");
  const [crop, setCrop] = useState<Crop>(initialCrop);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const originalUrlRef = useRef("");
  const fileVersionRef = useRef(0);
  const operationRef = useRef(false);
  const [error, setError] = useState("");
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const reader = new FileReader();
    const version = ++fileVersionRef.current;
    reader.onload = () => {
      if (active && typeof reader.result === "string") {
        originalUrlRef.current = reader.result;
        setUrl(reader.result); setCrop(initialCrop); setRotation(0); setDrag(null);
        setPreviewOpen(false); setError(""); setBusy(false); operationRef.current = false;
      }
    };
    reader.onerror = () => { if (active) setError("照片读取失败，请重新选择。 "); };
    reader.readAsDataURL(file);
    return () => {
      active = false; reader.abort();
      // This is an operation generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (fileVersionRef.current === version) fileVersionRef.current++;
    };
  }, [file]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateHeight = () => setViewportHeight(Math.round(viewport?.height ?? window.innerHeight));
    updateHeight();
    viewport?.addEventListener("resize", updateHeight);
    viewport?.addEventListener("scroll", updateHeight);
    window.addEventListener("resize", updateHeight);
    return () => {
      viewport?.removeEventListener("resize", updateHeight);
      viewport?.removeEventListener("scroll", updateHeight);
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  const beginMove = (event: React.PointerEvent) => {
    if (operationRef.current) return;
    event.preventDefault();
    containerRef.current?.setPointerCapture(event.pointerId);
    setDrag({ mode: "move", startX: event.clientX, startY: event.clientY, initial: crop });
  };

  const beginResize = (event: React.PointerEvent, handle: CropHandle) => {
    if (operationRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    containerRef.current?.setPointerCapture(event.pointerId);
    setDrag({ mode: "resize", handle, startX: event.clientX, startY: event.clientY, initial: crop });
  };

  const move = (event: React.PointerEvent) => {
    if (!drag || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / rect.height) * 100;
    if (drag.mode === "move") {
      setCrop({ ...drag.initial, x: clamp(drag.initial.x + dx, 0, 100 - drag.initial.width), y: clamp(drag.initial.y + dy, 0, 100 - drag.initial.height) });
    } else {
      setCrop(resizeCropFromCorner(drag.initial, drag.handle, dx, dy));
    }
  };

  const nudgeCorner = (event: React.KeyboardEvent, handle: CropHandle) => {
    if (operationRef.current) return;
    const delta = event.shiftKey ? 3 : 1;
    const dx = event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0;
    const dy = event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    setCrop((current) => resizeCropFromCorner(current, handle, dx, dy));
  };

  const rotate = async () => {
    if (operationRef.current || !url) return;
    operationRef.current = true;
    const version = fileVersionRef.current;
    const nextRotation = (rotation + 90) % 360;
    setBusy(true); setError(""); setDrag(null);
    try {
      const nextUrl = await rotateImage(originalUrlRef.current, nextRotation);
      if (version !== fileVersionRef.current) return;
      setUrl(nextUrl); setRotation(nextRotation); setCrop(rotateCropClockwise);
    } catch (cause) {
      if (version === fileVersionRef.current) setError(cause instanceof Error ? cause.message : "图片旋转失败，请重试。");
    } finally {
      if (version === fileVersionRef.current) { setBusy(false); operationRef.current = false; }
    }
  };

  const confirm = async () => {
    if (operationRef.current || !url) return;
    operationRef.current = true;
    const version = fileVersionRef.current;
    setBusy(true); setError("");
    try {
      const blob = await cropAndCompress(url, crop);
      if (version !== fileVersionRef.current) return;
      onConfirm(blob, URL.createObjectURL(blob));
    } catch (cause) { if (version === fileVersionRef.current) setError(cause instanceof Error ? cause.message : "图片处理失败，请重新选择。 "); }
    finally { if (version === fileVersionRef.current) { setBusy(false); operationRef.current = false; } }
  };

  return <section className="cropper-panel fixed inset-x-0 top-0 z-50 flex flex-col bg-stone-950 text-white" style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}>
    <header className="flex items-center justify-between px-5 py-4">
      <button className="min-h-11 px-2 text-sm text-stone-300" onClick={onCancel}>{t("取消")}</button>
      <div className="text-center"><p className="text-sm font-semibold">{t(title)}</p><p className="text-xs text-stone-400">{t(hint)}</p></div>
      <button type="button" disabled={busy} aria-label={t("重置裁剪区域")} className="min-h-11 min-w-11 px-2 text-sm text-stone-300 disabled:opacity-40" onClick={() => setCrop(initialCrop)}><RefreshIcon className="h-5 w-5"/></button>
    </header>
    <div className="cropper-media flex min-h-0 flex-1 items-center overflow-hidden px-7">
      <div ref={containerRef} className="relative mx-auto w-fit max-w-full" onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={t("待裁剪的作业照片")} className="block max-h-[min(60dvh,calc(100dvh-260px))] max-w-full"/> : <div className="flex h-64 w-[80vw] items-center justify-center text-sm text-stone-400">{error ? t(error) : t("正在读取照片…")}</div>}
        <div
          className="crop-box absolute cursor-move touch-none border-2 border-amber-300 shadow-[0_0_0_9999px_rgba(0,0,0,.16)]"
          data-full-image={crop.x === 0 && crop.y === 0 && crop.width === 100 && crop.height === 100}
          style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }}
          onPointerDown={beginMove}
        >
          <CropCorner handle="north-west" label={t("拖动左上角调整裁剪范围")} onPointerDown={beginResize} onKeyDown={nudgeCorner}/>
          <CropCorner handle="north-east" label={t("拖动右上角调整裁剪范围")} onPointerDown={beginResize} onKeyDown={nudgeCorner}/>
          <CropCorner handle="south-west" label={t("拖动左下角调整裁剪范围")} onPointerDown={beginResize} onKeyDown={nudgeCorner}/>
          <CropCorner handle="south-east" label={t("拖动右下角调整裁剪范围")} onPointerDown={beginResize} onKeyDown={nudgeCorner}/>
        </div>
      </div>
    </div>
    <footer className="cropper-footer px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-5">
      <div className="cropper-tools mb-3 flex justify-center gap-3">
        <button type="button" disabled={busy || !url} onClick={() => setPreviewOpen(true)} className="min-h-11 rounded-xl bg-white/10 px-5 text-sm disabled:opacity-40"><ZoomIcon/>{t("放大查看")}</button>
        <button type="button" disabled={busy || !url} onClick={() => void rotate()} className="min-h-11 rounded-xl bg-white/10 px-5 text-sm disabled:opacity-40"><RedoIcon/>{t("旋转90°")}</button>
      </div>
      {error && <p className="mb-3 text-center text-sm text-red-300" role="alert">{t(error)}</p>}
      <button className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-stone-950 disabled:opacity-50" onClick={confirm} disabled={busy || !url}>
        <CheckIcon className="h-5 w-5"/>{busy ? t("正在处理图片…") : t(confirmLabel)}
      </button>
    </footer>
    {previewOpen && <ImageZoomPreview url={url} onClose={() => setPreviewOpen(false)}/>}
  </section>;
}

export function rotateCropClockwise(crop: Crop): Crop {
  return { x: 100 - crop.y - crop.height, y: crop.x, width: crop.height, height: crop.width };
}

async function rotateImage(url: string, degrees: number): Promise<string> {
  if (degrees === 0) return url;
  const image = await loadImage(url);
  const canvas = document.createElement("canvas");
  const sideways = degrees % 180 !== 0;
  canvas.width = sideways ? image.naturalHeight : image.naturalWidth;
  canvas.height = sideways ? image.naturalWidth : image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法旋转图片");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(degrees * Math.PI / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const result = canvas.toDataURL("image/png");
  if (result === "data:,") throw new Error("图片太大，无法旋转，请换一张较小的图片。");
  return result;
}

interface ZoomView { scale: number; x: number; y: number }
export function zoomPreviewAt(view: ZoomView, scale: number, x: number, y: number): ZoomView {
  const nextScale = Math.min(6, Math.max(1, scale));
  if (nextScale === 1) return { scale: 1, x: 0, y: 0 };
  const ratio = nextScale / view.scale;
  return { scale: nextScale, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio };
}

function ImageZoomPreview({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useUiText();
  const [view, setView] = useState<ZoomView>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const points = useRef(new Map<number, { x: number; y: number }>());
  const areaRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);
  const update = (next: ZoomView) => {
    const area = areaRef.current;
    const limitX = (area?.clientWidth ?? 0) * (next.scale - 1) / 2;
    const limitY = (area?.clientHeight ?? 0) * (next.scale - 1) / 2;
    const bounded = { ...next, x: clamp(next.x, -limitX, limitX), y: clamp(next.y, -limitY, limitY) };
    viewRef.current = bounded; setView(bounded);
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = points.current.get(event.pointerId);
    if (!previous) return;
    const before = [...points.current.values()];
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...points.current.values()];
    if (before.length === 2) {
      const distance = (p: typeof before) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const oldDistance = distance(before);
      if (oldDistance < 1) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const center = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 };
      const next = zoomPreviewAt(viewRef.current, viewRef.current.scale * distance(after) / oldDistance, center.x - rect.left - rect.width / 2, center.y - rect.top - rect.height / 2);
      next.x += (after[0].x + after[1].x) / 2 - center.x;
      next.y += (after[0].y + after[1].y) / 2 - center.y;
      update(next);
    } else if (before.length === 1) {
      update({ ...viewRef.current, x: viewRef.current.x + event.clientX - previous.x, y: viewRef.current.y + event.clientY - previous.y });
    }
  };
  return <div role="dialog" aria-modal="true" aria-label={t("放大查看图片")} className="cropper-zoom absolute inset-0 z-10 flex flex-col bg-stone-950" onKeyDown={(event) => {
    if (event.key === "Escape") onClose();
    if (event.key === "Tab") {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")].filter((button) => !button.disabled);
      const first = buttons[0]; const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header className="flex shrink-0 items-center justify-between gap-2 px-5 py-3"><p className="text-sm">{t("双指缩放，单指移动")}</p><button ref={closeRef} type="button" onClick={onClose} className="min-h-11 px-3 text-sm">{t("返回裁剪")}</button></header>
    <div ref={areaRef} className="flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden" onPointerDown={(event) => {
      event.preventDefault(); if (points.current.size >= 2) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }} onPointerMove={pointerMove} onPointerUp={(event) => points.current.delete(event.pointerId)} onPointerCancel={(event) => points.current.delete(event.pointerId)} onLostPointerCapture={(event) => points.current.delete(event.pointerId)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={t("放大预览的作业照片")} draggable={false} className="max-h-full max-w-full select-none object-contain" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}/>
    </div>
    <footer className="flex shrink-0 items-center justify-center gap-3 px-3 pb-[max(24px,env(safe-area-inset-bottom))] pt-3">
      <button type="button" disabled={view.scale <= 1} onClick={() => update(zoomPreviewAt(viewRef.current, viewRef.current.scale / 1.5, 0, 0))} className="min-h-11 rounded-xl bg-white/10 px-4 disabled:opacity-40">{t("缩小")}</button>
      <button type="button" aria-label={t("恢复适应屏幕")} onClick={() => update({ scale: 1, x: 0, y: 0 })} className="min-h-11 px-3 tabular-nums">{Math.round(view.scale * 100)}%</button>
      <button type="button" disabled={view.scale >= 6} onClick={() => update(zoomPreviewAt(viewRef.current, viewRef.current.scale * 1.5, 0, 0))} className="min-h-11 rounded-xl bg-white/10 px-4 disabled:opacity-40">{t("放大")}</button>
    </footer>
  </div>;
}

function CropCorner({ handle, label, onPointerDown, onKeyDown }: {
  handle: CropHandle;
  label: string;
  onPointerDown: (event: React.PointerEvent, handle: CropHandle) => void;
  onKeyDown: (event: React.KeyboardEvent, handle: CropHandle) => void;
}) {
  const north = handle.startsWith("north");
  const west = handle.endsWith("west");
  const position = `${north ? "-top-3" : "-bottom-3"} ${west ? "-left-3" : "-right-3"}`;
  const cursor = handle === "north-west" || handle === "south-east" ? "cursor-nwse-resize" : "cursor-nesw-resize";
  const corner = `${north ? "top-2 border-t-4" : "bottom-2 border-b-4"} ${west ? "left-2 border-l-4" : "right-2 border-r-4"}`;
  return <button
    type="button"
    aria-label={label}
    className={`absolute ${position} ${cursor} h-11 w-11 touch-none rounded-lg outline-none focus-visible:bg-white/15 focus-visible:ring-2 focus-visible:ring-white`}
    onPointerDown={(event) => onPointerDown(event, handle)}
    onKeyDown={(event) => onKeyDown(event, handle)}
  ><span aria-hidden="true" className={`absolute ${corner} h-6 w-6 border-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]`}/></button>;
}

export function resizeCropFromCorner(initial: Crop, handle: CropHandle, dx: number, dy: number): Crop {
  const right = initial.x + initial.width;
  const bottom = initial.y + initial.height;
  const nextLeft = handle.endsWith("west") ? clamp(initial.x + dx, 0, right - minimumCropWidth) : initial.x;
  const nextRight = handle.endsWith("east") ? clamp(right + dx, initial.x + minimumCropWidth, 100) : right;
  const nextTop = handle.startsWith("north") ? clamp(initial.y + dy, 0, bottom - minimumCropHeight) : initial.y;
  const nextBottom = handle.startsWith("south") ? clamp(bottom + dy, initial.y + minimumCropHeight, 100) : bottom;
  return { x: nextLeft, y: nextTop, width: nextRight - nextLeft, height: nextBottom - nextTop };
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

async function cropAndCompress(url: string, crop: Crop): Promise<Blob> {
  const image = await loadImage(url);
  const sx = image.naturalWidth * crop.x / 100;
  const sy = image.naturalHeight * crop.y / 100;
  const sw = image.naturalWidth * crop.width / 100;
  const sh = image.naturalHeight * crop.height / 100;
  const scale = Math.min(1, 2048 / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法处理图片");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片压缩失败")), "image/jpeg", 0.86));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片格式无法读取，请换一张照片"));
    image.src = url;
  });
}
