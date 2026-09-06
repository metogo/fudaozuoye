"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTextBatcher = createTextBatcher;
/** Coalesce token bursts; flush before every non-text event to preserve ordering. */
function createTextBatcher(append, delay = 40) {
    let pending = "";
    let timer;
    const clear = () => { if (timer !== undefined)
        clearTimeout(timer); timer = undefined; };
    const flush = () => {
        clear();
        const text = pending;
        pending = "";
        if (text)
            append(text);
    };
    return {
        push(text) {
            pending += text;
            if (timer === undefined)
                timer = setTimeout(flush, delay);
        },
        flush,
        discard() { clear(); pending = ""; },
    };
}
