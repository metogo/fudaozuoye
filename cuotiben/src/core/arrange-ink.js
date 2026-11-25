// Simplify only within the stroke's own tolerance. Keep endpoints, pen lifts and sharp turns.
function distanceFromSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function strokeBox(strokes) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const points of strokes) for (const [x, y] of points) {
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { left, top, width: right - left, height: bottom - top };
}

function simplify(points, tolerance) {
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = tolerance, split = a;
    for (let i = a + 1; i < b; i++) {
      const d = distanceFromSegment(points[i], points[a], points[b]);
      if (d > far) { far = d; split = i; }
    }
    if (split !== a) {
      keep.add(split);
      stack.push([a, split], [split, b]);
    }
  }
  return points.filter((_, i) => keep.has(i));
}

export function arrangedPath(points) {
  if (!points.length) return '';
  const first = points[0], last = points.at(-1), move = 'M' + first.join(' ');
  if (points.length === 1) return move + 'h0.01';
  const box = strokeBox([points]);
  const size = Math.max(box.width, box.height);
  const knots = simplify(points, Math.min(3.2, Math.max(0.2, size * 0.045)));
  let path = move;
  for (let i = 1; i < knots.length - 1; i++) {
    const prev = knots[i - 1], p = knots[i], next = knots[i + 1];
    const ux = p[0] - prev[0], uy = p[1] - prev[1], vx = next[0] - p[0], vy = next[1] - p[1];
    const a = Math.hypot(ux, uy), b = Math.hypot(vx, vy);
    if (a * b === 0 || ux * vx + uy * vy < 0.32 * a * b) {
      path += ' L' + p.join(' ');
    } else {
      const radius = Math.min(a / 2, b / 2, size * 0.12);
      path += ` L${p[0] - ux * radius / a} ${p[1] - uy * radius / a} Q${p.join(' ')} ${p[0] + vx * radius / b} ${p[1] + vy * radius / b}`;
    }
  }
  return path + ' L' + last.join(' ');
}
