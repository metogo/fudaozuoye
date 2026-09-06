/** Keep the newest snapshot; cap storage writes while streaming without starvation. */
export function createDeferredTask(delay = 350) {
  let latest: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; latest = undefined; };
  const flush = () => { const task = latest; cancel(); task?.(); };
  return {
    schedule(task: () => void) { latest = task; if (timer === undefined) timer = setTimeout(flush, delay); },
    flush,
    cancel,
  };
}
