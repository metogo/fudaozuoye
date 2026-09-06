"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageTime = messageTime;
/** Display the persisted creation time, never the time of a rerender/reload. */
function messageTime(createdAt) {
    if (!createdAt)
        return null;
    const date = new Date(createdAt);
    if (!Number.isFinite(date.getTime()))
        return null;
    const pad = (value) => String(value).padStart(2, "0");
    const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return { clock, dateTime: date.toISOString(), label: `${day} ${clock}（本地时间）` };
}
