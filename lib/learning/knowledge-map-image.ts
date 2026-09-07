import type { MapPoint } from "./knowledge-map";

export function mapImageFrame(boxes: (MapPoint & { width: number; height: number })[]) {
  if (!boxes.length || boxes.some(b => ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0)) throw new Error("知识点尺寸尚未就绪，请稍后重试");
  const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
  const contentWidth = Math.max(...boxes.map(b => b.x + b.width)) - left;
  const width = Math.max(480, Math.ceil(contentWidth + 96));
  const height = Math.ceil(Math.max(...boxes.map(b => b.y + b.height)) - top + 96);
  const sheetHeight = height + 112;
  // Bound canvas memory on mobile; never silently crop distant nodes.
  const pixelRatio = Math.min(2, 4096 / width, 4096 / sheetHeight, Math.sqrt(12_000_000 / (width * sheetHeight)));
  if (pixelRatio < .75) throw new Error("节点摆放过于分散，请先点击“整理”再导出清晰图片");
  return { width, height, sheetHeight, pixelRatio, viewport: { x: (width - contentWidth) / 2 - left, y: 48 - top, zoom: 1 } };
}
