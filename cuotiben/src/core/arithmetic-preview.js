// A conservative preview for a single line of arithmetic. Cloud recognition still checks the draft.
import { strokeBox } from './arrange-ink.js';

// Centerline examples on a small grid. A slash separates pen lifts.
const digitExamples = {
  0: ['30 11 03 06 18 38 57 65 62 50 30'],
  1: ['02 20 28', '10 18'],
  2: ['02 11 30 50 61 63 05 08 68', '02 10 30 51 52 54 08 68', '02 10 30 51 53 08 68'],
  3: ['01 20 50 61 53 34 54 65 67 48 18 07'],
  4: ['40 05 65/50 58', '10 15 65/50 58'],
  5: ['60 10 04 34 55 66 57 38 18 07', '60 10/10 04 34 55 66 57 38 18 07'],
  6: ['50 31 13 05 06 18 48 67 65 54 34 15 05'],
  7: ['00 60 28'],
  8: ['30 11 12 53 65 67 48 18 06 14 53 61 50 30'],
  9: ['54 34 14 02 11 30 50 61 63 38'],
};

function samples(strokes, box) {
  const result = [];
  for (const stroke of strokes) {
    let previous;
    for (const [x, y] of stroke) {
      const point = [(x - box.left) / box.height, (y - box.top) / box.height];
      if (previous) {
        const dx = point[0] - previous[0],
          dy = point[1] - previous[1];
        const steps = Math.ceil(Math.hypot(dx, dy) / 0.065);
        for (let s = 1; s < steps; s++)
          result.push([previous[0] + (dx * s) / steps, previous[1] + (dy * s) / steps]);
      }
      if (
        !result.length ||
        !previous ||
        Math.hypot(point[0] - result.at(-1)[0], point[1] - result.at(-1)[1]) >= 0.025
      )
        result.push(point);
      previous = point;
    }
  }
  return result;
}

const templates = Object.entries(digitExamples).flatMap(([digit, examples]) =>
  examples.map((example) => {
    const strokes = example
      .split('/')
      .map((stroke) => stroke.split(' ').map((pair) => [...pair].map(Number)));
    const box = strokeBox(strokes);
    return { digit, lifts: strokes.length, aspect: box.width / box.height, points: samples(strokes, box) };
  }),
);

function distance(from, to) {
  let sum = 0,
    worst = 0;
  for (const [x, y] of from) {
    let nearest = Infinity;
    for (const [a, b] of to) nearest = Math.min(nearest, (a - x) ** 2 + (b - y) ** 2);
    nearest = Math.sqrt(nearest);
    sum += nearest;
    worst = Math.max(worst, nearest);
  }
  return sum / from.length + worst * 0.4;
}

function digitAt(strokes, box) {
  const aspect = box.width / box.height,
    points = samples(strokes, box);
  if (!points.length || points.length > 200) return;
  const scores = new Map();
  for (const t of templates) {
    if (t.lifts !== strokes.length || Math.abs(t.aspect - aspect) > 0.4) continue;
    const fit = t.aspect ? Math.max(0.7, Math.min(1.35, aspect / t.aspect)) : 1;
    const target = t.points.map(([x, y]) => [x * fit, y]);
    const score =
      (distance(points, target) + distance(target, points)) / 2 + Math.abs(t.aspect - aspect) * 0.08;
    scores.set(t.digit, Math.min(scores.get(t.digit) ?? Infinity, score));
  }
  const [first, second] = [...scores].sort((a, b) => a[1] - b[1]);
  if (first && first[1] < 0.095 && (!second || second[1] - first[1] > 0.019)) return first[0];
}

function operatorAt(strokes, line) {
  const boxes = strokes.map((s) => strokeBox([s]));
  const horizontal = (b) => b.width > 0.23 * line.height && b.height < 0.1 * b.width;
  const vertical = (b) => b.height > 0.25 * line.height && b.width < 0.1 * b.height;
  const middleX = (b) => b.left + b.width / 2,
    middleY = (b) => b.top + b.height / 2;
  if (
    boxes.some(
      (b) => Math.abs(middleY(b) - middleY(line)) > 0.26 * line.height || b.width > 1.2 * line.height,
    )
  )
    return;
  if (boxes.length === 1 && horizontal(boxes[0])) return '-';
  if (boxes.length !== 2) return;
  const [a, b] = boxes;
  if (
    boxes.every(horizontal) &&
    Math.abs(middleX(a) - middleX(b)) < 0.15 * Math.min(a.width, b.width) &&
    Math.min(a.width, b.width) > 0.7 * Math.max(a.width, b.width) &&
    Math.abs(middleY(a) - middleY(b)) > 0.09 * line.height
  )
    return '=';
  const h = boxes.find(horizontal),
    v = boxes.find(vertical);
  if (
    h &&
    v &&
    Math.abs(middleX(h) - middleX(v)) < h.width * 0.22 &&
    Math.abs(middleY(h) - middleY(v)) < v.height * 0.22
  )
    return '+';
}

export function arithmeticPreview(strokes) {
  if (strokes.length < 3 || strokes.length > 48 || strokes.some((s) => s.length < 2 || s.length > 500))
    return '';
  const line = strokeBox(strokes);
  if (line.height < 8 || line.width < line.height) return '';
  const groups = [];
  for (const stroke of [...strokes]
    .map((s) => ({ s, box: strokeBox([s]) }))
    .sort((a, b) => a.box.left - b.box.left)) {
    const last = groups.at(-1),
      right = stroke.box.left + stroke.box.width;
    if (last && stroke.box.left <= last.right + line.height * 0.025) {
      last.strokes.push(stroke.s);
      last.right = Math.max(last.right, right);
    } else groups.push({ strokes: [stroke.s], right });
  }
  let expression = '';
  for (const group of groups) {
    const box = strokeBox(group.strokes);
    const symbol =
      operatorAt(group.strokes, line) || (box.height >= line.height * 0.72 && digitAt(group.strokes, box));
    if (!symbol) return '';
    expression += symbol;
  }
  return /^\d+(?:[+-]\d+)*(?:=\d+(?:[+-]\d+)*)?$/.test(expression) && /[+=-]/.test(expression)
    ? '$' + expression + '$'
    : '';
}
