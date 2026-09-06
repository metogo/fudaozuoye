"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teachingStrokes = exports.teachingColors = void 0;
exports.teachingSceneSvg = teachingSceneSvg;
exports.teachingColors = { base: "#dcece4", change: "#f7ce69", outline: "#245246" };
exports.teachingStrokes = { base: "#2865a8", change: "#ad5708", outline: "#245246" };
function teachingSceneSvg(scene) {
    const content = scene.shapes.map((shape) => {
        if (shape.kind === "label")
            return `<text x="${shape.x}" y="${shape.y}" text-anchor="middle" font-size="${scene.template === "general" ? 28 : 19}" font-family="sans-serif" fill="#193d32">${escapeXml(shape.text)}</text>`;
        const color = exports.teachingColors[shape.color];
        if (shape.kind === "path")
            return `<${shape.closed ? "polygon" : "polyline"} points="${shape.points.map(p => p.join(",")).join(" ")}" fill="${shape.closed ? color : "none"}" fill-opacity="0.3" stroke="${exports.teachingStrokes[shape.color]}" stroke-width="3"${shape.arrow ? ' marker-end="url(#arrow)"' : ""}/>`;
        if (shape.kind === "circle")
            return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.radius}" fill="none" stroke="${exports.teachingStrokes[shape.color]}" stroke-width="3"/>`;
        if (shape.kind === "line")
            return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${color}" stroke-width="${shape.width ?? 3}"/>`;
        return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${shape.color === "outline" ? "none" : color}" stroke="#245246" stroke-width="3"${shape.dashed ? ' stroke-dasharray="8 6"' : ""}/>`;
    }).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#245246"/></marker></defs><rect width="800" height="520" fill="#fbfaf6"/>${content}</svg>`;
}
function escapeXml(value) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}
