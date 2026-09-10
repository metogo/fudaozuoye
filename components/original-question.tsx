"use client";

/* eslint-disable @next/next/no-img-element */

import { useId, useState } from "react";
import type { ChatMessage, ProblemSnapshot } from "@/lib/learning/types";
import { BookIcon, ChevronIcon } from "./icons";
import { useUiText } from "./ui-language";
import { MessageTime } from "./message-time";
import { RichLearningText } from "./lazy-rich-learning-text";

/** A reading aid only: the original message stays intact in session/export data. */
export function OriginalQuestion({ message, problem }: { message: ChatMessage; problem?: ProblemSnapshot }) {
  const t = useUiText();
  const [expanded, setExpanded] = useState(false);
  const [brokenImage, setBrokenImage] = useState<string>();
  const contentId = useId();
  // The fixed intake phrase identifies photo messages in older sessions without an asset key.
  const photo = Boolean(message.imageAssetId || message.imageUrl || message.text === "这道题我不会，想把它学懂。");
  const showImage = Boolean(message.imageUrl && brokenImage !== message.imageUrl);
  const recoveredProblem = photo && !showImage ? problem : undefined;
  return <section className="original-question shrink-0 border-b border-emerald-900/10 pb-1">
    <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)}
      className="original-question-toggle flex min-h-11 w-full items-center gap-2 text-left text-xs text-[#516c5c] transition hover:text-emerald-900 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
      <BookIcon className="h-4 w-4"/>
      <span className="flex-1">{t(expanded ? "收起原题" : "查看原题")}</span>
      <ChevronIcon className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}/>
    </button>
    <div id={contentId} hidden={!expanded} className="original-question-content pb-4 pt-2">
      {expanded && <><div className="rounded-2xl bg-[#f1f6f3] p-3 sm:p-4">
        {showImage && <img src={message.imageUrl} onError={() => setBrokenImage(message.imageUrl)} alt={t("学生发送的题目")} className="max-h-[60vh] w-full rounded-lg object-contain"/>}
        {photo && !showImage && <p role="status" className="mb-3 text-xs leading-5 text-[#7a6952]">{t(recoveredProblem ? "原图在当前浏览器不可用，以下是已识别的题目内容。" : "原图在当前浏览器不可用，题干尚未识别完成。")}</p>}
        {recoveredProblem ? <div className="original-question-recovered text-sm leading-7 text-[#254c3c]">
          <RichLearningText text={recoveredProblem.text}/>
          {recoveredProblem.visualContext?.related && <div className="mt-3 border-t border-emerald-900/10 pt-3">
            <p className="mb-1 text-xs text-[#708878]">{t("已识别的配图信息")}</p>
            <RichLearningText text={recoveredProblem.visualContext.summary}/>
            <ul>{recoveredProblem.visualContext.facts.map((fact, index) => <li key={index}><RichLearningText text={fact.text}/></li>)}</ul>
          </div>}
          {recoveredProblem.childWork && <div className="mt-3"><p className="text-xs text-[#708878]">{t("照片中的已有作答")}</p><RichLearningText text={recoveredProblem.childWork}/></div>}
        </div> : (!photo || (showImage && message.text !== "这道题我不会，想把它学懂。")) && <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[#254c3c]">{message.text}</p>}
      </div><MessageTime createdAt={message.createdAt}/></>}
    </div>
  </section>;
}
