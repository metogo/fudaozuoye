import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { arithmeticPreview } from '../core/arithmetic-preview.js';
import { originalInkImage } from '../core/ink.js';
import { recognizeInk } from '../core/learning.js';

const previewDelay = 280;
const recognitionDelay = 550;

export function useInkArrangement(ink, change, editing) {
  const [writing, setWriting] = useState(false), [settled, setSettled] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const current = useRef({ ink, change }), run = useRef(null), entry = useRef(null);
  useLayoutEffect(() => { current.current = { ink, change }; });
  const { strokes, autoTypeset, proposedText, transcript, transcriptNeedsReview } = ink;
  const readyText = (!transcriptNeedsReview && transcript) || proposedText;
  const history = useRef([]);
  useLayoutEffect(() => {
    if (!readyText || !strokes.length) return;
    const previous = history.current.filter(item => item.strokes !== strokes);
    history.current = [{ strokes, text: readyText }, ...previous.slice(0, 7)];
  }, [strokes, readyText]);

  function previousText(next) {
    return history.current.find(item => item.strokes.length === next.length &&
      item.strokes.every((stroke, i) => stroke === next[i]))?.text || '';
  }

  useEffect(() => {
    if (writing || editing || !autoTypeset || !strokes.length || readyText) return;
    const controller = new AbortController();
    run.current = controller;
    const preview = setTimeout(() => setSettled({ strokes, text: arithmeticPreview(strokes) }), previewDelay);
    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;
      setBusy(true);
      try {
        if (entry.current?.strokes !== strokes) entry.current = { strokes, id: crypto.randomUUID() };
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]);
        const image = await originalInkImage(strokes);
        const text = await recognizeInk(image, entry.current.id, signal);
        const latest = current.current;
        if (!controller.signal.aborted && latest.ink.strokes === strokes)
          latest.change({ ...latest.ink, proposedText: text });
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure.name === 'TimeoutError' ? '排版超时，已保留手写。' : failure.message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, recognitionDelay);
    return () => { clearTimeout(preview); clearTimeout(timer); controller.abort(); };
  }, [strokes, autoTypeset, readyText, writing, editing, retry]);

  function interrupt() {
    run.current?.abort();
    setBusy(false);
    setError('');
  }
  function begin() {
    interrupt();
    setWriting(true);
  }
  function end() {
    interrupt();
    setWriting(false);
  }
  const showingInk = autoTypeset && !writing && !editing;
  const localDraft = showingInk && settled?.strokes === strokes && !error && !readyText ? settled.text : '';
  return {
    arranged: showingInk && settled?.strokes === strokes ? strokes : [],
    typeset: showingInk ? readyText || localDraft : '',
    localDraft, busy, error, previousText, interrupt, begin, end, release: () => setWriting(false),
    retry: () => { interrupt(); setRetry(n => n + 1); },
  };
}
