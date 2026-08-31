const transientStatuses = new Set([429, 500, 502, 503, 504]);

export async function fetchWithTransientRetry(fetcher: typeof fetch, input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  let response = await fetcher(input, init);
  if (!transientStatuses.has(response.status)) return response;

  const retryAfter = response.headers.get("retry-after");
  await response.body?.cancel();
  await abortableDelay(retryDelay(retryAfter), init.signal);
  response = await fetcher(input, init);
  return response;
}

function retryDelay(value: string | null): number {
  const seconds = value === null ? Number.NaN : Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(3_000, seconds * 1_000);
  return 900;
}

function abortableDelay(milliseconds: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, milliseconds, resolve);
    const abort = () => finish(() => reject(new DOMException("Aborted", "AbortError")));
    function finish(complete: () => void) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      complete();
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}
