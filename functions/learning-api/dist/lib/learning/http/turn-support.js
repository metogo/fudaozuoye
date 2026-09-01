"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireImage = requireImage;
exports.appendUnique = appendUnique;
exports.pathLabels = pathLabels;
function requireImage(imageDataUrl) {
    if (!imageDataUrl)
        throw new Error("请先选择要发送的图片");
    return imageDataUrl;
}
function appendUnique(values, ...next) {
    return [...new Set(values.concat(next))];
}
function pathLabels(session, nodeIds) {
    return nodeIds.map((id) => session.nodes.find((node) => node.id === id)?.title).filter((value) => Boolean(value));
}
