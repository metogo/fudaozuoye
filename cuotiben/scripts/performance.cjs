const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { gzipSync } = require('node:zlib');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const dist = path.resolve('dist'),
  root = 'http://127.0.0.1:43876';
const report = { cold: [], listing: [], filters: [] };
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

function staticResponse(req, res) {
  const pathname = new URL(req.url, root).pathname;
  const f = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!f.startsWith(dist + '/') || !existsSync(f)) {
    res.writeHead(404).end();
    return;
  }
  const raw = readFileSync(f),
    type = mime[path.extname(f)] || 'application/octet-stream';
  if (/text|json|javascript|svg/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip' }).end(gzipSync(raw));
  } else res.writeHead(200, { 'Content-Type': type }).end(raw);
}
async function frames(p) {
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
async function coldRun(p) {
  await p.goto(root, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.empty-book');
  await frames(p);
  return p.evaluate(() => ({
    lcp: window.benchmark.lcp,
    cls: window.benchmark.cls,
    resources: performance
      .getEntriesByType('resource')
      .map((e) => ({ path: new URL(e.name).pathname, bytes: e.encodedBodySize, ms: Math.round(e.duration) })),
  }));
}
async function fill(p) {
  const dataset = JSON.parse(readFileSync(path.join(process.env.SHITI_PAPERS, 'cases.json')));
  const results = JSON.parse(readFileSync(process.env.SHITI_RESULTS));
  const photoRows = JSON.parse(readFileSync(path.resolve('docs/qa/同页三题实测.json'))).rows;
  const seed = dataset.map((r) => ({
    q: photoRows.find((photo) => r.id === 'math-' + photo.n)?.q || r.text,
    lesson: results.find((e) => e.id === r.id && e.correct && e.lesson).lesson,
  }));
  const image = readFileSync(path.join(process.env.SHITI_PAPERS, 'math-page-3.png')).toString('base64');
  await p.evaluate(
    async ({ seed, image }) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('shiti-family-live');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const blob = await (await fetch('data:image/png;base64,' + image)).blob();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['questions', 'list'], 'readwrite');
        for (let i = 0; i < 300; i++) {
          const sample = seed[i % seed.length],
            id = crypto.randomUUID(),
            date = Date.now() + i;
          const row = { ...sample, id, date, img: blob, child: '', teacher: '', source: '照片圈题', attempts: [] };
          tx.objectStore('questions').put(row);
          tx.objectStore('list').put({ id, date, q: row.q.slice(0, 180), source: row.source, isCorrected: false });
        }
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { seed, image },
  );
}
async function measure(p) {
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const c = await p.createCDPSession();
  await p.setCacheEnabled(false);
  await c.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 500000,
    uploadThroughput: 250000,
  });
  await p.evaluateOnNewDocument(() => {
    window.benchmark = { lcp: 0, cls: 0 };
    for (const type of ['largest-contentful-paint', 'layout-shift'])
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (type === 'largest-contentful-paint') window.benchmark.lcp = e.startTime;
          else if (!e.hadRecentInput) window.benchmark.cls += e.value;
        }
      }).observe({ type, buffered: true });
  });
  for (let i = 0; i < 10; i++) report.cold.push(await coldRun(p));
  assert(report.cold.every((r) => r.lcp > 0 && !r.resources.some((s) => /motion\/(collected|corrected|again)|Formula-|KaTeX/.test(s.path))));
  await c.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await fill(p);
  for (let i = 0; i < 10; i++) {
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.sheet-row');
    await frames(p);
    report.listing.push(
      await p.evaluate(() => {
        if (document.querySelectorAll('.sheet-row').length !== 300) throw Error('题数不符');
        return performance.now();
      }),
    );
  }
  for (let i = 0; i < 30; i++) {
    const elapsed = await p.evaluate(async (i) => {
      const buttons = document.querySelectorAll('.filters button'),
        start = performance.now();
      buttons[i % 2 === 0 ? 2 : 0].click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - start;
    }, i);
    report.filters.push(elapsed);
  }
}
async function main() {
  const server = createServer(staticResponse);
  await new Promise((resolve, reject) => server.once('error', reject).listen(43876, '127.0.0.1', resolve));
  const b = await launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const p = await b.newPage();
    await measure(p);
    const p75 = (a) => [...a].sort((x, y) => x - y)[Math.ceil(0.75 * a.length) - 1];
    report.summary = {
      lcpP75: p75(report.cold.map((r) => r.lcp)),
      clsMax: Math.max(...report.cold.map((r) => r.cls)),
      listP75: p75(report.listing),
      filterP75: p75(report.filters),
    };
    writeFileSync(process.env.SHITI_REPORT, JSON.stringify(report, null, 2));
    console.log(report.summary);
  } finally {
    await b.close();
    server.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
