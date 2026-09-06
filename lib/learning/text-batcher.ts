/** Coalesce token bursts; flush before every non-text event to preserve ordering. */
export function createTextBatcher(append: (text: string) => void, delay = 40) {
  let pending = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const flush = () => {
    clear();
    const text = pending;
    pending = "";
    if (text) append(text);
  };
  return {
    push(text: string) {
      pending += text;
      if (timer === undefined) timer = setTimeout(flush, delay);
    },
    flush,
    discard() { clear(); pending = ""; },
  };
}
