"use client";

import { useRef, useState } from "react";
import { ReactSketchCanvas, type ReactSketchCanvasRef } from "react-sketch-canvas";
import { CheckIcon, EraserIcon, PencilIcon, RedoIcon, TrashIcon, UndoIcon } from "./icons";

export function WhiteboardInput({ title = "白板作答", taskLabel, submitLabel, hint = "写步骤、公式或画辅助线都可以，AI 会结合当前题目阅读", onConfirm, onCancel }: {
  title?: string;
  taskLabel: string;
  submitLabel: string;
  hint?: string;
  onConfirm: (blob: Blob, previewUrl: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [pathCount, setPathCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectTool = (next: "pen" | "eraser") => {
    setTool(next);
    canvasRef.current?.eraseMode(next === "eraser");
  };

  const confirm = async () => {
    if (!pathCount || busy) return;
    setBusy(true); setError("");
    try {
      const dataUrl = await canvasRef.current?.exportImage("png");
      if (!dataUrl) throw new Error("白板还没有可发送的内容");
      const blob = await (await fetch(dataUrl)).blob();
      onConfirm(blob, URL.createObjectURL(blob));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "白板导出失败，请重试");
    } finally { setBusy(false); }
  };

  return <section className="fixed inset-0 z-[70] flex h-dvh flex-col bg-[#f5f4f0] text-stone-950" aria-label={title}>
    <header className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur-xl">
      <button type="button" onClick={onCancel} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-stone-500">取消</button>
      <div className="min-w-0 px-3 text-center"><h2 className="text-sm font-bold">{title}</h2><p className="max-w-[52vw] truncate text-[10px] text-stone-400">{taskLabel}</p></div>
      <button type="button" disabled={!pathCount || busy} onClick={confirm} className="min-h-11 rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white disabled:bg-stone-200 disabled:text-stone-400">{busy ? "处理中" : submitLabel}</button>
    </header>

    <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-5">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm">
        <div className="flex gap-1">
          <ToolButton active={tool === "pen"} label="画笔" onClick={() => selectTool("pen")}><PencilIcon className="h-4 w-4"/></ToolButton>
          <ToolButton active={tool === "eraser"} label="橡皮" onClick={() => selectTool("eraser")}><EraserIcon className="h-4 w-4"/></ToolButton>
        </div>
        <div className="flex gap-1">
          <IconButton label="撤销" onClick={() => canvasRef.current?.undo()}><UndoIcon className="h-4 w-4"/></IconButton>
          <IconButton label="重做" onClick={() => canvasRef.current?.redo()}><RedoIcon className="h-4 w-4"/></IconButton>
          <IconButton label="清空" onClick={() => canvasRef.current?.clearCanvas()}><TrashIcon className="h-4 w-4"/></IconButton>
        </div>
      </div>
      <div className="whiteboard-paper min-h-0 flex-1 overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-[0_16px_50px_rgba(41,37,36,.1)]">
        <ReactSketchCanvas
          ref={canvasRef}
          width="100%"
          height="100%"
          strokeColor="#1c1917"
          strokeWidth={3.2}
          eraserWidth={18}
          eraserMode="mask"
          canvasColor="white"
          allowOnlyPointerType="all"
          touchAction="none"
          withViewBox
          style={{ border: 0, borderRadius: 0 }}
          onChange={(paths) => setPathCount(paths.length)}
        />
      </div>
      {error && <p role="alert" className="mt-2 text-center text-xs text-red-700">{error}</p>}
      <p className="mt-2 text-center text-[10px] text-stone-400"><CheckIcon className="mr-1 inline h-3 w-3"/>{hint}</p>
    </div>
  </section>;
}

function ToolButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition ${active ? "bg-stone-950 text-white" : "text-stone-500 hover:bg-stone-100"}`}>{children}{label}</button>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-stone-950">{children}</button>;
}
