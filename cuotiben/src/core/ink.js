import { strokeBox } from './arrange-ink.js';

// Older notebooks use a 600 × 396 page. Enlarge the page only where ink exists.
export const sheetWidth = 600;
export const sheetHeight = 396;
export function inkBounds(strokes) {
  let width = sheetWidth, height = sheetHeight;
  for (const stroke of strokes) {
    for (const [x, y] of stroke) {
      width = Math.max(width, x);
      height = Math.max(height, y);
    }
  }
  return { width, height };
}

export function inkPath(points) {
  if (!points.length) return '';
  const [[x, y]] = points;
  if (points.length === 1) return `M${x} ${y}h0.01`;
  return points.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join(' ');
}

export function originalInkImage(strokes) {
  const box = strokeBox(strokes);
  const padding = 16;
  const width = box.width + 2 * padding, height = box.height + 2 * padding;
  const canvas = document.createElement('canvas');
  const scale = Math.min(2, 3200 / Math.max(width, height));
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(padding - box.left, padding - box.top);
  ctx.strokeStyle = '#172e28';
  ctx.lineWidth = 3;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const points of strokes) ctx.stroke(new Path2D(inkPath(points)));
  return new Promise((resolve, reject) => canvas.toBlob(blob =>
    blob ? resolve(blob) : reject(Error('无法读取白板图像，请重试。')), 'image/png'));
}
