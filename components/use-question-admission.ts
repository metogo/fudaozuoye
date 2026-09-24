"use client";

import { useEffect, useRef, useState } from "react";
import { createQuestionAdmission } from "@/lib/browser/question-admission";

export function useQuestionAdmission(setNotice: (message: string) => void) {
  const [access] = useState(createQuestionAdmission);
  const [admitting, setAdmitting] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  const admit = async (input: string | Blob) => {
    if (request.current) return false;
    const controller = new AbortController();
    request.current = controller;
    setAdmitting(true);
    setNotice("");
    try {
      await access.admit(input, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
      return !controller.signal.aborted;
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error instanceof Error && error.name !== "TimeoutError"
        ? error.message : "暂时无法核对今日解题次数，请稍后重试。当前题目仍可继续学习。");
      return false;
    } finally {
      if (request.current === controller) { request.current = null; setAdmitting(false); }
    }
  };
  const cancel = () => {
    request.current?.abort();
    request.current = null;
    setAdmitting(false);
  };
  return { admit, admitting, cancel, ticket: () => access.ticket };
}
