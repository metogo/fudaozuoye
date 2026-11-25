const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const input = process.env.SHITI_PAPERS;
const origin = process.env.SHITI_ORIGIN || 'http://localhost:43872';

const { click, choosePhoto, circle } = require('./browser-acceptance.cjs');
async function until(page, selector) {
  await page.waitForFunction(
    (s) =>
      document.querySelector(s) || (!document.querySelector('.job-state') && document.querySelector('[role=alert]')),
    { timeout: 185000 },
    selector,
  );
  assert(await page.$(selector), await page.$eval('main', (m) => m.innerText.slice(-220)));
}
async function waitForModel(page, target, retryButton, retries) {
  for (;;) {
    try {
      await until(page, target);
      return;
    } catch (error) {
      const alert = await page.$('[role=alert]');
      const status = alert ? await alert.evaluate((el) => el.textContent) : '';
      if (retries.length >= 2 || !/超时|过于频繁|服务繁忙/.test(status)) throw error;
      if (await page.$('.work-result')) retryButton = '重新解析';
      retries.push({ button: retryButton, status });
      console.log('原题保留，重试', retryButton, status);
      if (status.includes('频繁')) await new Promise((resolve) => setTimeout(resolve, 60000));
      await click(page, retryButton);
    }
  }
}
async function main() {
  const browser = await launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const page = await browser.newPage(),
    rows = [];
  try {
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(origin);
    await choosePhoto(page, '从相册选', path.join(input, 'math-page-3.png'));
    const items = [
      { n: 4, y: [146, 185], numbers: ['436', '157', '242'] },
      { n: 5, y: [224, 416], numbers: ['560', '246', '46', '268', '314', '320', '360'] },
      { n: 6, y: [442, 487], numbers: ['764', '9'] },
    ];
    for (const { n, y } of items) {
      const retries = [];
      let start = Date.now();
      await circle(page, 64, y[0], 475, y[1]);
      if (n === 4) {
        assert.match(await page.$eval('.send-notice summary', x => x.innerText), /框内图片/);
        await page.setOfflineMode(true);
        await click(page, '解析框内题目');
        await page.waitForFunction(() => document.querySelector('[role=alert]')?.textContent.includes('网络连接失败'));
        assert(await page.$('.footer-act button:not(:disabled)'));
        await page.setOfflineMode(false);
        start = Date.now();
      }
      await click(page, '解析框内题目');
      await waitForModel(page, '.guidance .hint', '解析框内题目', retries);
      const solveMs = Date.now() - start;
      await page.click('.original-photo summary');
      await page.waitForSelector('.original-photo .proof');
      const imgLength = await page.$eval('.proof', (img) => new TextEncoder().encode(img.src).length);
      await click(page, n < 6 ? '收录并圈下一题' : '加入错题本');
      await until(page, '.collection-feedback');
      if (n < 6) assert((await page.$eval('.collection-feedback', (e) => e.innerText)).includes('已收录 ' + (n - 3) + ' 道'));
      rows.push({ n, solveMs, imgLength, retries });
      console.log('已收录', n, '识别至解析完成毫秒', solveMs);
    }
    await until(page, '.sheet-row');
    await page.reload();
    await until(page, '.sheet-row');
    const records = await page.evaluate(async () => {
      const read = (request) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const db = await read(indexedDB.open('shiti-family-live'));
      try {
        const tx = db.transaction(['questions', 'list']);
        const [questions, list] = await Promise.all(['questions', 'list'].map((name) => read(tx.objectStore(name).getAll())));
        return await Promise.all(questions.map(async (q) => {
          const bytes = (obj) => new TextEncoder().encode(JSON.stringify(obj)).length;
          const textBytes = bytes({ ...q, img: '' }) + bytes(list.find((row) => row.id === q.id));
          const image = await q.img.arrayBuffer();
          const hash = await crypto.subtle.digest('SHA-256', image);
          return { q: q.q, model: q.lesson.modelId, conclusion: q.lesson.steps.at(-1),
            cropHash: Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join(''),
            bytes: textBytes + image.byteLength, textBytes };
        }));
      } finally { db.close(); }
    });
    assert.equal(records.length, 3);
    assert.equal(new Set(records.map((r) => r.cropHash)).size, 3);
    for (const row of rows) {
      const { n } = row;
      const { numbers } = items.find(item => item.n === n);
      const record = records.find(r => r.q.includes({4: '436', 5: '560', 6: '764'}[n]));
      assert(record && record.model.includes('doubao'));
      const q = record.q;
      row.q = q;
      for (const number of numbers) assert(q.includes(number), '题 ' + n + ' 未识出 ' + number + ' 原始识别：' + q);
      const operators = q.replaceAll('\\times', '×').replaceAll('−', '-').replaceAll('＋', '+');
      assert.equal([...operators].filter((c) => c === { 4: '+', 5: '-', 6: '×' }[n]).length, 2, '运算符与原卷相符');
      if (n === 5) assert.match(q, /A[.、：:\s]*268.*B[.、：:\s]*314.*C[.、：:\s]*320.*D[.、：:\s]*360/is);
      assert.match(record.conclusion, { 4: /835/, 5: /268|[选選项項]\s*[AＡ]/, 6: /764/ }[n]);
    }
    if (process.env.SHITI_REPORT)
      fs.writeFileSync(process.env.SHITI_REPORT, JSON.stringify({ rows, records }, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
