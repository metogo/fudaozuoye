"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithTransientRetry = fetchWithTransientRetry;
const transientStatuses = new Set([429, 500, 502, 503, 504]);
async function fetchWithTransientRetry(fetcher, input, init) {
    let response = await fetcher(input, init);
    if (!transientStatuses.has(response.status))
        return response;
    const retryAfter = response.headers.get("retry-after");
    await response.body?.cancel();
    await abortableDelay(retryDelay(retryAfter), init.signal);
    response = await fetcher(input, init);
    return response;
}
function retryDelay(value) {
    const seconds = value === null ? Number.NaN : Number(value);
    if (Number.isFinite(seconds) && seconds >= 0)
        return Math.min(3_000, seconds * 1_000);
    return 900;
}
function abortableDelay(milliseconds, signal) {
    if (signal?.aborted)
        return Promise.reject(new DOMException("Aborted", "AbortError"));
    return new Promise((resolve, reject) => {
        const timer = setTimeout(finish, milliseconds, resolve);
        const abort = () => finish(() => reject(new DOMException("Aborted", "AbortError")));
        function finish(complete) {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            complete();
        }
        signal?.addEventListener("abort", abort, { once: true });
    });
}
