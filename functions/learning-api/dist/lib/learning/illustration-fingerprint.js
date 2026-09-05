"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.illustrationFingerprint = illustrationFingerprint;
function illustrationFingerprint(session) {
    const source = `${session.requestId}\n${stableStringify(session.problem)}`;
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < source.length; index += 1) {
        const code = source.charCodeAt(index);
        first = Math.imul(first ^ code, 0x01000193) >>> 0;
        second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
    }
    return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}
function stableStringify(value) {
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
