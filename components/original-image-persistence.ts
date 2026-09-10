import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction, type RefObject } from "react";
import type { ChatMessage } from "@/lib/learning/types";
import { loadQuestionImage, removeQuestionImage, saveQuestionImage } from "@/lib/browser/question-image-store";

export const IMAGE_SAVE_NOTICE = "原图未能保存在此浏览器；刷新后可查看已识别题干。";
export const IMAGE_RESTORE_NOTICE = "原图暂时无法恢复，可展开原题查看已识别题干。";

export function retainOriginalImage(blob: Blob, onFailure: () => void): string {
  const id = crypto.randomUUID();
  void saveQuestionImage(id, blob).catch(onFailure);
  return id;
}

export async function restoreOriginalImage(message: ChatMessage | undefined, active: () => boolean,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>, previews: RefObject<string[]>, onFailure: () => void) {
  if (typeof message?.imageAssetId !== "string") return;
  try {
    const blob = await loadQuestionImage(message.imageAssetId);
    if (!active()) return;
    if (!blob) { onFailure(); return; }
    const url = URL.createObjectURL(blob);
    previews.current.push(url);
    setMessages(current => current.map(item => item.id === message.id && item.imageAssetId === message.imageAssetId
      ? { ...item, imageUrl: url } : item));
  } catch { if (active()) onFailure(); }
}

export function forgetOriginalImage(message: ChatMessage | undefined, onFailure: () => void) {
  if (typeof message?.imageAssetId === "string") void removeQuestionImage(message.imageAssetId).catch(onFailure);
}

export function useOriginalImagePersistence(setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  setNotice: Dispatch<SetStateAction<string>>, previews: RefObject<string[]>) {
  const lifetime = useRef({ active: true, epoch: 0 });
  useEffect(() => {
    const owner = lifetime.current;
    owner.active = true;
    return () => { owner.active = false; owner.epoch += 1; };
  }, []);
  const clear = useCallback((message?: ChatMessage) => {
    lifetime.current.epoch += 1;
    forgetOriginalImage(message, () => {
      if (lifetime.current.active) setNotice("旧原图未能从本机清理，可在浏览器设置中清除网站数据。");
    });
  }, [setNotice]);
  const retain = useCallback((blob: Blob, previous?: ChatMessage) => {
    clear(previous);
    const epoch = lifetime.current.epoch;
    return retainOriginalImage(blob, () => {
      if (lifetime.current.active && lifetime.current.epoch === epoch) setNotice(IMAGE_SAVE_NOTICE);
    });
  }, [clear, setNotice]);
  const restore = useCallback((message?: ChatMessage) => {
    const epoch = lifetime.current.epoch;
    return restoreOriginalImage(message, () => lifetime.current.active && lifetime.current.epoch === epoch,
      setMessages, previews, () => setNotice(IMAGE_RESTORE_NOTICE));
  }, [setMessages, setNotice, previews]);
  return { retain, restore, clear };
}
