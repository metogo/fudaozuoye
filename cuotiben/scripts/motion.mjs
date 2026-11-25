// Editable artwork in a 96 × 96 composition. Times are authored in 60 fps frames.
import { writeFileSync } from 'node:fs';
import { biteFrames, releaseFrames, celebrationStart, celebrationFrames, openingFrames } from '../src/core/opening.js';
const ink = '#175c50',
  sage = '#6b9a85',
  paper = '#eef6ee',
  accent = '#d49642';
const color = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((c) => parseInt(c, 16) / 255);
const prop = (k) => ({ a: 0, k });
function tween(stops) {
  return {
    a: 1,
    k: stops.map(([t, s], i) =>
      i === stops.length - 1
        ? { t, s }
        : { t, s, e: stops[i + 1][1], o: { x: [0.25], y: [0.08] }, i: { x: [0.2], y: [1] } },
    ),
  };
}
const zero = prop([0, 0, 0]);
function shape(points, closed, fill, stroke, width = 2) {
  const tangents = points.map(() => [0, 0]);
  const parts = [{ ty: 'sh', ks: prop({ i: tangents, o: tangents, v: points, c: closed }) }];
  if (fill) parts.push({ ty: 'fl', c: prop(color(fill)), o: prop(100), r: 1 });
  if (stroke) parts.push({ ty: 'st', c: prop(color(stroke)), o: prop(100), w: prop(width), lc: 2, lj: 2 });
  return parts;
}
function layer(name, shapes, transform = {}) {
  return {
    ty: 4,
    nm: name,
    sr: 1,
    ip: 0,
    op: 60,
    st: 0,
    ks: { o: prop(100), r: prop(0), p: zero, a: zero, s: prop([100, 100, 100]), ...transform },
    shapes,
  };
}
const slip = [
  [32, 20],
  [58, 17],
  [64, 50],
  [37, 54],
];
const pocket = [
  [22, 44],
  [71, 41],
  [68, 72],
  [29, 75],
];
const leaf = [
  [30, 19],
  [66, 22],
  [63, 77],
  [24, 73],
];
const silk = [
  [52, 18],
  [65, 20],
  [61, 53],
  [56, 47],
  [48, 51],
];
const check = [
  [25, 50],
  [40, 63],
  [70, 30],
];
const checkStroke = shape(check, false, null, '#328777', 7);
const dash = {
  ty: 'tm',
  s: prop(0),
  e: tween([
    [1, [0]],
    [8, [34]],
    [23, [100]],
  ]),
  o: prop(0),
  m: 1,
};
const line = (a, b, col, width = 2) => shape([a, b], false, null, col, width);
const slide = {
  p: tween([
    [0, [5, -8, 0]],
    [5, [6, -12, 0]],
    [20, [0, 3, 0]],
    [29, [0, 1, 0]],
  ]),
};
const collected = [
  layer('前袋压线', line([29, 61], [63, 58], '#79b4dc', 1)),
  layer('前袋亮边', line([24, 45], [69, 42], '#f3ffff')),
  layer('透蓝前袋', shape(pocket, true, '#87baa8', ink)),
  layer('纸上第二行', line([38, 35], [54, 33], sage), slide),
  layer('纸上第一行', line([37, 29], [48, 28], sage), slide),
  layer(
    '折起的纸角',
    shape(
      [
        [51, 18],
        [58, 17],
        [59, 24],
      ],
      true,
      '#e5e1ff',
      ink,
      1,
    ),
    slide,
  ),
  layer('错题纸页', shape(slip, true, paper, ink), slide),
  layer(
    '书本内封',
    shape(
      [
        [25, 28],
        [67, 24],
        [70, 67],
        [27, 73],
      ],
      true,
      '#528b7c',
      ink,
    ),
  ),
  layer(
    '纸袋投影',
    shape(
      [
        [25, 68],
        [69, 65],
        [69, 76],
        [30, 79],
      ],
      true,
      '#c7d9ec',
    ),
  ),
];
const glint = check.map(([x, y]) => [x - 0.5, y - 0.8]);
const corrected = [
  layer('对勾透光亮边', [...shape(glint, false, null, '#b8f6de', 2), dash]),
  layer('一笔写出的对勾', [...checkStroke, dash]),
];
for (let i = 0; i < 6; i++) {
  const angle = (i * Math.PI) / 3,
    dx = Math.cos(angle),
    dy = Math.sin(angle);
  corrected.push(
    layer(
      '收笔光点 ' + (i + 1),
      line([48 + 32 * dx, 48 + 32 * dy], [48 + 36 * dx, 48 + 36 * dy], i % 2 ? accent : sage),
      {
        p: tween([
          [12, [0, 0, 0]],
          [34, [dx * 5, dy * 5, 0]],
        ]),
        o: tween([
          [0, [0]],
          [12 + (i % 3), [0]],
          [19 + (i % 3), [85]],
          [38, [0]],
        ]),
      },
    ),
  );
}
const again = [
  layer('可找回的书签', shape(silk, true, '#dfa851', '#8174bc', 1), {
    p: tween([
      [0, [0, -9, 0]],
      [4, [0, -10, 0]],
      [19, [0, 1, 0]],
      [23, [0, 0, 0]],
    ]),
  }),
  layer('题页第二行', line([32, 61], [44, 62], sage)),
  layer('题页第一行', line([32, 53], [45, 54], sage)),
  layer('保留的题页', shape(leaf, true, paper, ink)),
];
function path(shape, x, y, fill, stroke, width = 2) {
  const point = ([px, py], [dx, dy] = [0, 0]) => [px + dx + x, py + dy + y].join(' ');
  let d = 'M' + point(shape.v[0]);
  for (let end = 1; end <= shape.v.length; end++) {
    const next = end % shape.v.length;
    const from = shape.o[end - 1], to = shape.i[next];
    if (next === 0 && !shape.c) break;
    if (from.some(Boolean) || to.some(Boolean))
      d += ' C' + point(shape.v[end - 1], from) + ' ' + point(shape.v[next], to) + ' ' + point(shape.v[next]);
    else if (next) d += ' L' + point(shape.v[next]);
  }
  return '<path d="' + d + (shape.c ? ' Z' : '') + '" fill="' + (fill || 'none') + '" stroke="' +
    (stroke || 'none') + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"/>';
}
function endValue(property) {
  return property.a ? property.k.at(-1).s : property.k;
}
function staticLayer(l) {
  if (Number(endValue(l.ks.o)) === 0) return '';
  const [x, y] = endValue(l.ks.p),
    items = l.shapes;
  const outline = items.find((item) => item.ty === 'sh').ks;
  const shape = outline.a ? endValue(outline)[0] : outline.k;
  const fill = items.find((item) => item.ty === 'fl'),
    stroke = items.find((item) => item.ty === 'st');
  const hex = (item) =>
    item &&
    '#' +
      item.c.k
        .map((c) =>
          Math.round(c * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
  return (
    path(
      shape, x - endValue(l.ks.a)[0], y - endValue(l.ks.a)[1],
      hex(fill),
      hex(stroke),
      stroke?.w.k,
    )
  );
}
// The mouth opens in the silhouette itself so it works on any page background.
function contour(points, incoming, outgoing, fill) {
  const parts = shape(points, true, fill);
  Object.assign(parts[0].ks.k, { i: incoming, o: outgoing });
  return parts;
}
const body = contour(
  [[46,9],[82,47],[33,87],[20,84],[48,67],[15,52],[13,46],[13,39]],
  [[-19,0],[0,-23],[29,4],[0,2],[-4,10],[4,10],[0,3],[0,3]],
  [[20,0],[0,23],[-6,0],[11,2],[-16,1],[-1,-2],[-.4,-3],[1,-17]], '#101843');
const closed = body[0].ks.k;
// A notch opens on the eye side; the comma tail stays in its original silhouette.
const open = structuredClone(closed);
open.v.splice(5,3,[18,56],[44,45],[14,34]);
open.i.splice(5,3,[4,8],[-4,3],[4,2]);
open.o.splice(5,3,[3,-1],[-5,-2],[2,-14]);
const puff = structuredClone(closed);
puff.v[1] = [89,46];
puff.v[5] = [10,53];
body[0].ks = tween([
  [0,[closed]], ...biteFrames.flatMap(t => [[t-12,[closed]], [t-5,[open]], [t,[closed]]]),
  [90,[puff]], [100,[closed]],
  ...releaseFrames.flatMap(t => [[t-4,[puff]], [t+1,[open]], [t+6,[closed]]]),
]);
const eye = contour(
  [[33,28],[38,36],[33,44],[28,36]],
  [[-3,0],[0,-4.5],[3,0],[0,4.5]], [[3,0],[0,4.5],[-3,0],[0,-4.5]], '#ffc53c');
// Celebration times are relative to the settled title. The gold eye curves into a smile.
const celebrate = stops => stops.map(([t, value]) => [celebrationStart + t, value]);
const restingEye = eye[0].ks.k;
const smilingEye = {
  c: true, v: [[33,27],[43,36],[33,33],[23,36]],
  i: [[-6,0],[0,-4],[5,0],[0,6]], o: [[6,0],[0,6],[-5,0],[0,-4]],
};
eye[0].ks = tween(celebrate([[0,[restingEye]], [13,[smilingEye]], [88,[smilingEye]], [119,[restingEye]]]));
const finishMark = layer('落地亮起的金色小勾', [
  ...shape([[72,11],[78,17],[91,4]], false, null, '#bf871d', 4),
  { ty:'tm', s:prop(0), e:tween(celebrate([[43,[0]], [49,[31]], [62,[100]]])), o:prop(0), m:1 },
], { o:tween(celebrate([[42,[0]], [48,[100]], [84,[100]], [105,[0]]])) });
const opening = [
  finishMark,
  { ...layer('望向落点，收尾眨眼', eye, {
    a: prop([33,36,0]),
    p: tween([[0,[33,36,0]], [7,[40,32,0]], [30,[30,33,0]], [79,[29,32,0]], [99,[33,36,0]],
      [112,[29,30,0]], [154,[29,30,0]], [170,[33,36,0]]]),
    s: tween([[0,[100,100,100]], [88,[102,76,100]], [101,[100,100,100]],
      [160,[100,100,100]], [164,[111,14,100]], [170,[100,100,100]]]),
  }), parent: 3 },
  layer('左侧咬字，鼓腮吹字', body, {
    a: prop([46,83,0]), p: prop([46,83,0]),
    r: tween([[0,[0]], [7,[-7]], [19,[9]], [31,[0]],
      ...biteFrames.flatMap(t => [[t-5,[-4]], [t,[3]]]), [98,[0]],
      ...releaseFrames.flatMap(t => [[t-3,[3]], [t+2,[-6]], [t+7,[0]]]),
      ...celebrate([[0,[0]], [12,[-7]], [27,[11]], [43,[-5]], [59,[9]], [75,[-7]], [92,[3]], [119,[0]]])]),
    s: tween([[0,[100,100,100]], [7,[108,89,100]], [15,[96,104,100]], [31,[105,94,100]],
      ...biteFrames.flatMap(t => [[t-5,[97,104,100]], [t,[106,95,100]]]), [98,[100,100,100]],
      ...releaseFrames.flatMap(t => [[t-4,[106,94,100]], [t+1,[94,104,100]], [t+7,[100,100,100]]]),
      ...celebrate([[0,[100,100,100]], [12,[110,86,100]], [19,[95,106,100]], [32,[100,100,100]],
        [43,[111,87,100]], [51,[98,102,100]], [65,[101,98,100]], [92,[100,100,100]]])]),
  }),
];
const posters = {};
for (const [kind, frames, layers] of [
  ['opening', openingFrames, opening],
  ['collected', 30, collected],
  ['corrected', 39, corrected],
  ['again', 24, again],
]) {
  const still = layers.slice().reverse().map(staticLayer).join('');
  const data = {
    v: '5.12.2',
    nm: kind,
    fr: 60,
    ip: 0,
    op: frames,
    w: 96,
    h: 96,
    ddd: 0,
    assets: [],
    ...(kind === 'opening' ? { markers:[{ tm:celebrationStart, dr:celebrationFrames, cm:'庆祝完成' }] } : {}),
    layers: layers.map((l, i) => ({ ...l, ind: i + 1, op: frames })),
  };
  writeFileSync('public/motion/' + kind + '.json', JSON.stringify(data));
  posters[kind] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' + still + '</svg>';
  writeFileSync('public/motion/' + kind + '.svg', posters[kind] + '\n');
}
// Bundle posters with the UI so offline saves can immediately show their final frame.
writeFileSync(
  'src/core/motion-posters.js',
  '// Generated by scripts/motion.mjs\nexport default ' + JSON.stringify(posters, null, 2) + ';\n',
);
