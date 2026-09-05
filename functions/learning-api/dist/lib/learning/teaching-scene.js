"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teachingColors = void 0;
exports.teachingSceneSvg = teachingSceneSvg;
exports.teachingColors = { base: "#dcece4", change: "#f7ce69", outline: "#245246" };
function teachingSceneSvg(scene) {
    const content = scene.shapes.map((shape) => {
        if (shape.kind === "label")
            return `<text x="${shape.x}" y="${shape.y}" text-anchor="middle" font-size="19" font-family="sans-serif" fill="#193d32">${escapeXml(shape.text)}</text>`;
        const color = exports.teachingColors[shape.color];
        if (shape.kind === "line")
            return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${color}" stroke-width="${shape.width ?? 3}"/>`;
        return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${shape.color === "outline" ? "none" : color}" stroke="#245246" stroke-width="3"${shape.dashed ? ' stroke-dasharray="8 6"' : ""}/>`;
    }).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520"><rect width="800" height="520" fill="#fbfaf6"/>${content}</svg>`;
}
function escapeXml(value) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}
