"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sortChronology = sortChronology;
const dynasties = ["春秋", "战国", "秦", "汉", "唐", "宋", "元", "明", "清"];
function chronologyValue(value) {
    const numeric = value.trim().match(/^(公元前\s*)?(\d{1,4})\s*(年|世纪)$/);
    if (numeric) {
        const amount = Number(numeric[2]);
        const rank = numeric[3] === "世纪"
            ? numeric[1] ? -amount * 100 : (amount - 1) * 100 + 1
            : numeric[1] ? -amount : amount;
        return { kind: "numeric", rank };
    }
    const dynasty = dynasties.findIndex((item) => value.trim().startsWith(item));
    return dynasty >= 0 ? { kind: "dynasty", rank: dynasty } : null;
}
function sortChronology(items) {
    const ranked = items.map((item, index) => ({ item, index, chronology: chronologyValue(item.time) }));
    if (ranked.some((entry) => entry.chronology === null))
        return null;
    if (new Set(ranked.map((entry) => entry.chronology.kind)).size !== 1)
        return null;
    return ranked.sort((left, right) => left.chronology.rank - right.chronology.rank || left.index - right.index).map((entry) => entry.item);
}
