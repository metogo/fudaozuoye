import { useEffect, useRef, useState } from 'react';
export function useJob(report) {
  const request = useRef(null),
    [busy, setBusy] = useState(''),
    [preview, setPreview] = useState(null);
  function cancel() {
    const old = request.current;
    request.current = null;
    old?.abort();
    setPreview(null);
    setBusy('');
  }
  useEffect(() => () => request.current?.abort(), []);
  async function run(label, work, streaming = false) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPreview(streaming ? { hint: '', detail: '' } : null);
    setBusy(label);
    report('');
    const timeout = setTimeout(
      () => controller.abort(new DOMException('模型响应超时，原稿已保留。', 'TimeoutError')),
      180000,
    );
    try {
      await work(controller.signal, (text) => {
        if (request.current === controller) setBusy(text);
      }, (partial) => {
        if (request.current === controller && !controller.signal.aborted) setPreview(partial);
      });
    } catch (error) {
      if (request.current === controller)
        report(
          controller.signal.aborted
            ? '本次请求超时，请重试。'
            : error instanceof TypeError
              ? '网络连接失败，请检查网络后重试。'
              : error.message,
        );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setPreview(null);
        setBusy('');
      }
    }
  }
  return { busy, preview, run, cancel };
}
