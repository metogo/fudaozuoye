"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, RefreshIcon } from "./icons";

interface Crop { x: number; y: number; width: number; height: number }

export function ImageCropper({ file, onConfirm, onCancel }: { file: File; onConfirm: (blob: Blob, previewUrl: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [crop, setCrop] = useState<Crop>({ x: 5, y: 8, width: 90, height: 72 });
  const [drag, setDrag] = useState<{ mode: "move" | "resize"; startX: number; startY: number; initial: Crop } | null>(null);
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

  const begin = (event: React.PointerEvent, mode: "move" | "resize") => {
    event.preventDefault();
    containerRef.current?.setPointerCapture(event.pointerId);
    setDrag({ mode, startX: event.clientX, startY: event.clientY, initial: crop });
  };

  const move = (event: React.PointerEvent) => {
    if (!drag || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / rect.height) * 100;
    if (drag.mode === "move") {
      setCrop({ ...crop, x: clamp(drag.initial.x + dx, 0, 100 - drag.initial.width), y: clamp(drag.initial.y + dy, 0, 100 - drag.initial.height) });
    } else {
      setCrop({ ...crop, width: clamp(drag.initial.width + dx, 24, 100 - drag.initial.x), height: clamp(drag.initial.height + dy, 18, 100 - drag.initial.y) });
    }
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
      <div className="text-center"><p className="text-sm font-semibold">只保留一道题</p><p className="text-xs text-stone-400">拖动方框，右下角可缩放</p></div>
      <button className="min-h-11 px-2 text-sm text-stone-300" onClick={() => setCrop({ x: 5, y: 8, width: 90, height: 72 })}><RefreshIcon className="h-5 w-5"/></button>
    </header>
    <div className="cropper-media flex min-h-0 flex-1 items-center overflow-hidden px-4">
      <div ref={containerRef} className="relative mx-auto w-fit max-w-full overflow-hidden rounded-2xl" onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="待裁剪的作业照片" className="block max-h-[68vh] max-w-full"/> : <div className="flex h-64 w-[80vw] items-center justify-center text-sm text-stone-400">{error || "正在读取照片…"}</div>}
        <div className="pointer-events-none absolute inset-0 bg-black/50"/>
        <div
          className="crop-box absolute touch-none border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,.16)]"
          style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }}
          onPointerDown={(event) => begin(event, "move")}
        >
          <span className="absolute -left-0.5 -top-0.5 h-5 w-5 border-l-4 border-t-4 border-white"/>
          <span className="absolute -right-0.5 -top-0.5 h-5 w-5 border-r-4 border-t-4 border-white"/>
          <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 border-b-4 border-l-4 border-white"/>
          <button aria-label="缩放裁剪区域" className="absolute -bottom-4 -right-4 h-11 w-11 rounded-full border border-white/30 bg-white text-stone-950" onPointerDown={(event) => { event.stopPropagation(); begin(event, "resize"); }}><span className="block rotate-45 text-lg">↔</span></button>
        </div>
      </div>
    </div>
    <footer className="px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-5">
      {error && <p className="mb-3 text-center text-sm text-red-300" role="alert">{error}</p>}
      <button className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-stone-950 disabled:opacity-50" onClick={confirm} disabled={busy || !url}>
        <CheckIcon className="h-5 w-5"/>{busy ? "正在处理图片…" : "裁剪并识别"}
      </button>
    </footer>
  </section>;
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
