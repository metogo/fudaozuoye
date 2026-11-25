// Render the shared translucent glyph family at build-authoring time. No renderer ships to clients.
const { writeFileSync } = require('node:fs');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');

function prepareCanvas(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = kind === 'workbook' ? 720 : 300;
  canvas.height = kind === 'workbook' ? 432 : 206;
  const g = canvas.getContext('2d'),
    scale = canvas.width / 196;
  g.scale(scale, scale);
  g.translate(96, canvas.height / scale / 2);
  g.rotate(-0.11);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const path = (d) => new Path2D(d);
  const palettes = {
    blue: ['#e7fdfff2', '#94d7ffdc', '#589ee5e0', '#3c78d4e6', '#adcdffec'],
    violet: ['#f9f2ffed', '#e0d9ffe6', '#aaa7efe0', '#8074d7e3', '#d8caffec'],
    ice: ['#ffffffef', '#def5ffcf', '#aadcefc9', '#7cb9ddcf', '#ebfdfff0'],
    teal: ['#e8fffdf0', '#a1edecd9', '#60bfcadd', '#418fabe3', '#c4fcf5ef'],
  };
  function gradient(x, y, u, v, stops) {
    const a = g.createLinearGradient(x, y, u, v);
    stops.forEach(([p, c]) => a.addColorStop(p, c));
    return a;
  }
  function fill(d, style) {
    g.fillStyle = style;
    g.fill(path(d));
  }
  function stroke(d, style, w) {
    g.strokeStyle = style;
    g.lineWidth = w;
    g.stroke(path(d));
  }
  function lens(d, kind, x, y, w, h, depth = 3) {
    const p = palettes[kind],
      mat = gradient(x, y, x + w, y + h, [
        [0, p[0]],
        [0.22, p[1]],
        [0.55, p[2]],
        [0.78, p[3]],
        [1, p[4]],
      ]);
    g.save();
    g.translate(1, depth);
    g.shadowColor = '#2449803d';
    g.shadowBlur = 4 * scale;
    g.shadowOffsetY = 1.5 * scale;
    fill(d, p[3]);
    g.restore();
    fill(d, mat);
    stroke(
      d,
      gradient(x, y, x + w, y + h, [
        [0, '#ffffff'],
        [0.27, '#fbffffee'],
        [0.5, '#c4e6ff80'],
        [0.74, p[3]],
        [1, '#ffffffbb'],
      ]),
      1.45,
    );
    g.save();
    g.clip(path(d));
    const glaze = `M ${x - w * 0.12} ${y + h * 0.25} Q ${x + w * 0.2} ${y + h * 0.55} ${x + w * 1.4} ${y - h * 0.09} L ${x + w * 1.4} ${y - h} H ${x - w * 0.12} Z`;
    fill(
      glaze,
      gradient(x, y, x + w * 0.7, y + h * 0.52, [
        [0, '#ffffff70'],
        [1, '#ffffff12'],
      ]),
    );
    g.restore();
  }
  function rounded(x, y, w, h, r) {
    const d = new Path2D();
    d.roundRect(x, y, w, h, r);
    return d;
  }
  function circle(x, y, r) {
    const d = new Path2D();
    d.arc(x, y, r, 0, Math.PI * 2);
    return d;
  }
  function stylus() {
    g.save();
    g.translate(11, -3);
    g.rotate(-0.56);
    lens('M-52 1l14-5h82q4 0 4 4v3q0 3-4 3h-82z', 'ice', -51, -5, 101, 13, 1.5);
    stroke('M-36 -2H40', '#ffffffde', 1.3);
    stroke('M-49 1l8-2', '#3576aa', 1.9);
    stroke('M39 -3v9', '#82a5db', 1);
    g.restore();
  }
  window.art = { canvas, g, lens, fill, stroke, gradient, rounded, circle, stylus };
}
function workbook() {
  const { g, lens, fill, stroke, gradient } = window.art;
  g.scale(1.06, 1.06);
  g.transform(1, 0.04, -0.2, 0.91, 0, 0);
  const left = 'M-68 -38Q-29 -46 0 -24L0 43Q-32 26 -68 32Q-73 33 -73 27V-33Q-73 -37 -68 -38Z';
  const right = 'M0 -24Q29 -43 65 -36Q69 -35 69 -31V31Q69 36 65 35Q31 28 0 43Z';
  g.save();
  g.translate(0, 6);
  lens(left, 'blue', -74, -40, 74, 82);
  lens(right, 'violet', 0, -40, 72, 82);
  g.restore();
  g.save();
  g.translate(0, 2);
  lens(left, 'ice', -74, -40, 74, 82, 1);
  lens(right, 'violet', 0, -40, 72, 82, 1);
  g.restore();
  lens(left, 'ice', -74, -40, 74, 82, 1);
  lens(right, 'blue', 0, -40, 72, 82, 1);
  stroke('M0 -22v63', '#fcffffed', 1.6);
  for (let i = 0; i < 3; i++) {
    const y = -23 + i * 10;
    stroke('M-57 ' + y + 'q15 -2 34 4', '#4f8dc6be', 1.4);
  }
  fill(
    'M30 -32Q34 -33 39 -33v23l-4-3-5 3Z',
    gradient(30, -33, 38, -9, [
      [0, '#aab4f7'],
      [1, '#7962cf'],
    ]),
  );
  stroke('M9 3q18 -7 40 -4', '#e4f8ffc9', 1.4);
  stroke('M9 10q11 -4 27 -4', '#e4f8ffc9', 1.4);
}
function capture() {
  const { lens, fill, stroke, gradient, circle } = window.art;
  lens(
    'M-50 -24h20l6-9q2-3 5-3h20q4 0 6 4l4 8h32q9 0 9 9v41q0 8-8 8h-92q-8 0-8-8v-40q0-10 6-10Z',
    'blue',
    -55,
    -36,
    112,
    72,
  );
  lens(circle(3, 4, 23), 'ice', -20, -20, 46, 46, 2);
  lens(circle(3, 4, 17), 'blue', -14, -13, 34, 35, 1);
  fill(
    circle(3, 5, 10),
    gradient(-6, -4, 12, 14, [
      [0, '#9aebee'],
      [0.55, '#3877a8'],
      [1, '#274d89'],
    ]),
  );
  fill(circle(-1, 1, 3), '#f2ffffd9');
  stroke('M-37 -13h12', '#e6fcff', 2.5);
}
function write() {
  const { g, lens, stroke, rounded, stylus } = window.art;
  g.rotate(0.16);
  lens(rounded(-54, -35, 88, 72, 8), 'violet', -54, -35, 88, 72);
  for (let i = 0; i < 3; i++) stroke('M-40 ' + (-18 + i * 10) + 'h' + (i === 2 ? 26 : 44), '#f8f6ffcc', 2);
  stylus();
}
function read() {
  const { g, lens, fill, stroke, gradient, rounded, circle } = window.art;
  g.save();
  g.rotate(0.1);
  lens(rounded(-57, -23, 73, 54, 6), 'ice', -57, -23, 75, 55, 2);
  for (let i = 0; i < 3; i++) stroke('M-44 ' + (-10 + i * 9) + 'h' + (i === 2 ? 22 : 36), '#6296c39e', 1.6);
  g.restore();
  g.translate(9, -8);
  g.rotate(-0.65);
  lens(rounded(-5, 17, 10, 44, 5), 'blue', -5, 17, 10, 44, 1.5);
  lens(circle(0, 0, 25), 'teal', -25, -25, 50, 50, 2);
  fill(
    circle(0, 0, 18),
    gradient(-15, -16, 16, 17, [
      [0, '#eaffffe8'],
      [0.55, '#bfe4f0c9'],
      [1, '#7cc5d4cb'],
    ]),
  );
  stroke('M-15 -7q4-10 14-10', '#fff', 2);
  stroke('M18 7q-3 9-10 11', '#dbfff8ce', 1.3);
}
function file() {
  const { g, lens, stroke, rounded } = window.art;
  lens('M-47 -22q0-6 6-6h24l6 7h49q7 0 7 6v43h-92Z', 'violet', -47, -28, 92, 65);
  g.save();
  g.rotate(0.09);
  lens(rounded(-35, -37, 66, 59, 5), 'ice', -35, -37, 66, 60, 1.5);
  stroke('M-25 -25h31m-31 7h41', '#92b7cf', 1.4);
  g.restore();
  lens('M-51 -9q-1-4 4-4h30l5 5h55q5 0 4 5l-6 36q-1 4-6 4h-75q-5 0-6-4Z', 'blue', -51, -13, 98, 51);
  stroke('M-20 7h29', '#e1f6ffbd', 2.2);
}
(async () => {
  const browser = await launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage();
    for (const [kind, draw] of Object.entries({ workbook, capture, write, read, file })) {
      await page.evaluate(prepareCanvas, kind);
      await page.evaluate(draw);
      const data = await page.evaluate(() => window.art.canvas.toDataURL('image/webp', 0.9).split(',')[1]);
      writeFileSync('public/brand/' + kind + '.webp', Buffer.from(data, 'base64'));
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
