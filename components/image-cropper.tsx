"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, RefreshIcon } from "./icons";

export interface Crop { x: number; y: number; width: number; height: number }
type CropHandle = "north-west" | "north-east" | "south-west" | "south-east";
type Drag =
  | { mode: "move"; startX: number; startY: number; initial: Crop }
  | { mode: "resize"; handle: CropHandle; startX: number; startY: number; initial: Crop };

const initialCrop: Crop = { x: 5, y: 8, width: 90, height: 72 };
const minimumCropWidth = 15;
const minimumCropHeight = 12;

export function ImageCropper({ file, onConfirm, onCancel, title = "只保留一道题", hint = "拖动框移动，拖四角调整范围", confirmLabel = "裁剪并识别" }: { file: File; onConfirm: (blob: Blob, previewUrl: string) => void; onCancel: () => void; title?: string; hint?: string; confirmLabel?: string }) {
  const [url, setUrl] = useState("");
  const [crop, setCrop] = useState<Crop>(initialCrop);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const reader = new FileReader();
    reader.onload = () => { if (active && typeof reader.result === "string") setUrl(reader.result); };
    reader.onerror = () => { if (active) setError("照片读取失败，请重新选择。 "); };
    reader.readAsDataURL(file);
    return () => { active = false; reader.abort(); };
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
    event.preventDefault();
    containerRef.current?.setPointerCapture(event.pointerId);
    setDrag({ mode: "move", startX: event.clientX, startY: event.clientY, initial: crop });
  };

  const beginResize = (event: React.PointerEvent, handle: CropHandle) => {
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
    const delta = event.shiftKey ? 3 : 1;
    const dx = event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0;
    const dy = event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    setCrop((current) => resizeCropFromCorner(current, handle, dx, dy));
  };

  const confirm = async () => {
    setBusy(true); setError("");
    try {
      const blob = await cropAndCompress(url, crop);
      onConfirm(blob, URL.createObjectURL(blob));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "图片处理失败，请重新选择。 "); }
    finally { setBusy(false); }
  };

  return <section className="cropper-panel fixed inset-x-0 top-0 z-50 flex flex-col bg-stone-950 text-white" style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}>
    <header className="flex items-center justify-between px-5 py-4">
      <button className="min-h-11 px-2 text-sm text-stone-300" onClick={onCancel}>取消</button>
      <div className="text-center"><p className="text-sm font-semibold">{title}</p><p className="text-xs text-stone-400">{hint}</p></div>
      <button type="button" aria-label="重置裁剪区域" className="min-h-11 min-w-11 px-2 text-sm text-stone-300" onClick={() => setCrop(initialCrop)}><RefreshIcon className="h-5 w-5"/></button>
    </header>
    <div className="cropper-media flex min-h-0 flex-1 items-center overflow-hidden px-4">
      <div ref={containerRef} className="relative mx-auto w-fit max-w-full overflow-hidden rounded-2xl" onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="待裁剪的作业照片" className="block max-h-[68vh] max-w-full"/> : <div className="flex h-64 w-[80vw] items-center justify-center text-sm text-stone-400">{error || "正在读取照片…"}</div>}
        <div className="pointer-events-none absolute inset-0 bg-black/50"/>
        <div
          className="crop-box absolute touch-none border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,.16)]"
          style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }}
          onPointerDown={beginMove}
        >
          <CropCorner handle="north-west" label="拖动左上角调整裁剪范围" onPointerDown={beginResize} onKeyDown={nudgeCorner}/>
          <CropCorner handle="north-east" label="拖动右上角调整裁剪范围" onPointerDown={beginResize} onKeyDown={nudgeCorner}/>
          <CropCorner handle="south-west" label="拖动左下角调整裁剪范围" onPointerDown={beginResize} onKeyDown={nudgeCorner}/>
          <CropCorner handle="south-east" label="拖动右下角调整裁剪范围" onPointerDown={beginResize} onKeyDown={nudgeCorner}/>
        </div>
      </div>
    </div>
    <footer className="px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-5">
      {error && <p className="mb-3 text-center text-sm text-red-300" role="alert">{error}</p>}
      <button className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-stone-950 disabled:opacity-50" onClick={confirm} disabled={busy || !url}>
        <CheckIcon className="h-5 w-5"/>{busy ? "正在处理图片…" : confirmLabel}
      </button>
    </footer>
  </section>;
}

function CropCorner({ handle, label, onPointerDown, onKeyDown }: {
  handle: CropHandle;
  label: string;
  onPointerDown: (event: React.PointerEvent, handle: CropHandle) => void;
  onKeyDown: (event: React.KeyboardEvent, handle: CropHandle) => void;
}) {
  const north = handle.startsWith("north");
  const west = handle.endsWith("west");
  const position = `${north ? "top-0" : "bottom-0"} ${west ? "left-0" : "right-0"}`;
  const cursor = handle === "north-west" || handle === "south-east" ? "cursor-nwse-resize" : "cursor-nesw-resize";
  const corner = `${north ? "top-0 border-t-4" : "bottom-0 border-b-4"} ${west ? "left-0 border-l-4" : "right-0 border-r-4"}`;
  return <button
    type="button"
    aria-label={label}
    className={`absolute ${position} ${cursor} h-11 w-11 touch-none rounded-lg outline-none focus-visible:bg-white/15 focus-visible:ring-2 focus-visible:ring-white`}
    onPointerDown={(event) => onPointerDown(event, handle)}
    onKeyDown={(event) => onKeyDown(event, handle)}
  ><span aria-hidden="true" className={`absolute ${corner} h-6 w-6 border-white`}/></button>;
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
