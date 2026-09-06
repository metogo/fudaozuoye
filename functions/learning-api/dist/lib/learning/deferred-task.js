"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeferredTask = createDeferredTask;
/** Keep the newest snapshot; cap storage writes while streaming without starvation. */
function createDeferredTask(delay = 350) {
    let latest;
    let timer;
    const cancel = () => { if (timer !== undefined)
        clearTimeout(timer); timer = undefined; latest = undefined; };
    const flush = () => { const task = latest; cancel(); task?.(); };
    return {
        schedule(task) { latest = task; if (timer === undefined)
            timer = setTimeout(flush, delay); },
        flush,
        cancel,
    };
}
