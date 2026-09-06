"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatMessage, LearningSession } from "@/lib/learning/types";
import { conversationExportSnapshot, exportTimestamp, localExportImage, type ConversationExportSnapshot } from "@/lib/learning/conversation-export";
import { CloseIcon, DownloadIcon, InfoIcon } from "./icons";
import { RichLearningText } from "./rich-learning-text";
import "./conversation-export.css";

export function ConversationDocument({ snapshot }: { snapshot: ConversationExportSnapshot }) {
  return <article className="conversation-document" aria-label="完整对话导出内容">
    <header className="conversation-document__cover">
      <p className="conversation-document__brand">专注作业 / 学习记录</p>
      <h1>把思路，留在纸上。</h1>
      <p className="conversation-document__meta">导出于 {exportTimestamp(snapshot.exportedAt)} · {snapshot.messages.length} 条记录</p>
    </header>
    {snapshot.problem && <section className="conversation-document__problem"><h2>原题</h2><RichLearningText text={snapshot.problem.text}/>{snapshot.problem.childWork && <><h3>已有作答</h3><RichLearningText text={snapshot.problem.childWork}/></>}</section>}
    <h2 className="conversation-document__section-title">完整对话</h2>
    {snapshot.messages.map((message, index) => <section key={message.id} className={`conversation-document__entry conversation-document__entry--${message.role}`}>
      <header className="conversation-document__entry-heading">
        <span className="conversation-document__number">{String(index + 1).padStart(2, "0")}</span>
        <h3>{message.role === "user" ? "我的提问与作答" : message.role === "assistant" ? message.scopeLabel || "讲解" : "学习进度"}{message.surface === "board" ? " · 板书记录" : ""}</h3>
        <time dateTime={message.createdAt}>{exportTimestamp(message.createdAt)}</time>
      </header>
      {message.reference && <blockquote><p className="conversation-document__label">引用 · {message.reference.scopeLabel}</p><RichLearningText text={message.reference.sourceSummary}/></blockquote>}
      {localExportImage(message.imageUrl) && <figure><img src={localExportImage(message.imageUrl)} alt="本条记录中的题目或作答图片"/><figcaption>题目 / 作答图片</figcaption></figure>}
      <RichLearningText text={message.text} streaming={message.status === "streaming"}/>
      {message.status === "streaming" && <p className="conversation-document__warning">此条仍在生成，记录截至导出时已收到的内容。</p>}
      {message.status === "error" && <p className="conversation-document__warning">此条处理未完成，以上为已收到的内容。</p>}
      {!!message.suggestions?.length && <aside className="conversation-document__suggestions"><h4>猜你想问</h4><ul>{message.suggestions.map((suggestion, i) => <li key={i}><RichLearningText text={suggestion.text} compact/><span className="conversation-document__label">（关联：{suggestion.scopeLabel}）</span></li>)}</ul></aside>}
    </section>)}
    {snapshot.task && <section className="conversation-document__task"><h2>当前学习任务</h2><h3>{snapshot.task.title}</h3>
      {snapshot.task.stepBlank ? <><RichLearningText text={snapshot.task.prompt ?? ""}/><div className="conversation-document__blank"><RichLearningText text={snapshot.task.stepBlank.before} compact/><strong className="conversation-document__answer">{snapshot.task.revealedAnswer ? <RichLearningText text={snapshot.task.revealedAnswer} compact/> : "____________"}</strong><RichLearningText text={snapshot.task.stepBlank.after} compact/></div></> : snapshot.task.prompt && <RichLearningText text={snapshot.task.prompt}/>}
    </section>}
    <footer className="conversation-document__end">以上为本浏览器当前会话的本地记录，包含已收起的讲解；不包含未发送草稿。图片如已因刷新失效，则无法恢复。AI 讲解请结合题目核对。</footer>
  </article>;
}

export function ConversationExport({ messages, session, onClose }: { messages: ChatMessage[]; session: LearningSession | null; onClose: () => void }) {
  const [snapshot] = useState(() => conversationExportSnapshot(messages, session));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const titleRef = useRef<string | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    let active = true;
    const restoreTitle = () => {
      if (titleRef.current !== null) { document.title = titleRef.current; titleRef.current = null; }
    };
    window.addEventListener("afterprint", restoreTitle);
    const images = Array.from(contentRef.current?.querySelectorAll("img") ?? []);
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("图片或字体准备超时，请关闭预览后重试。")), 15_000); });
    const prepare = Promise.all([document.fonts.ready, ...images.map(async (image) => {
      try { await image.decode(); }
      catch { if (active) setNotice("部分本地图片已失效，PDF 会保留其位置与说明；文字内容不受影响。"); }
    })]);
    void Promise.race([prepare, timeout]).then(() => { if (active) setReady(true); }).catch((error: Error) => { if (active) setNotice(error.message); }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); dialog?.close(); restoreTitle(); window.removeEventListener("afterprint", restoreTitle); };
  }, []);
  const print = () => {
    if (!ready) return;
    if (typeof window.print !== "function") { setNotice("当前浏览器不支持打印，请用 Chrome、Edge 或 Safari 打开后导出。"); return; }
    titleRef.current ??= document.title;
    document.title = snapshot.filename;
    try { window.print(); }
    catch { setNotice("未能打开保存窗口，请使用浏览器菜单中的“打印”，并选择保存为 PDF。"); }
  };
  return createPortal(<div className="conversation-export-root">
    <dialog ref={dialogRef} className="conversation-export-dialog" aria-labelledby="conversation-export-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="conversation-export-toolbar"><div><p>本地保存 · 无需上传</p><h2 id="conversation-export-title">导出对话 PDF</h2></div><button type="button" onClick={onClose} aria-label="关闭导出预览" className="conversation-export-close"><CloseIcon className="h-5 w-5"/></button></header>
      <div className="conversation-export-help"><InfoIcon className="h-4 w-4"/><p>点击保存后，在打印窗口选择“另存为 PDF”。建议 A4 纵向；关闭浏览器页眉和页脚。</p></div>
      <div ref={contentRef} className="conversation-export-preview"><ConversationDocument snapshot={snapshot}/></div>
      <footer className="conversation-export-actions">{notice && <p role="status">{notice}</p>}<button type="button" onClick={print} disabled={!ready}><DownloadIcon className="h-4 w-4"/>{ready ? "保存为 PDF" : "正在准备图片与公式…"}</button></footer>
    </dialog>
  </div>, document.body);
}
