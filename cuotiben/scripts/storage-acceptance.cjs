const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');

async function verify(page, other, rows, session, origin) {
  async function save(tab, row) {
    return tab.evaluate(async (data) => (await import('/src/core/book.ts')).saveQuestion(data), row);
  }
  const [a, b] = rows;
  await Promise.all([save(page, a), save(other, b), save(other, a)]);
  for (const tab of [page, other])
    await tab.waitForFunction(() => document.querySelectorAll('.sheet-row').length === 2);
  const attempt = { id: crypto.randomUUID(), answer: a.lesson.answer, correct: true, paper: false, date: Date.now() };
  async function submit(tab, record) {
    return tab.evaluate(async (id, data) => (await import('/src/core/book.ts')).saveAttempt(id, data), a.id, record);
  }
  await Promise.all([submit(page, attempt), submit(other, attempt)]);
  assert.equal((await submit(page, attempt)).attempts.length, 1);
  const again = await submit(other, { ...attempt, id: crypto.randomUUID(), correct: false, date: Date.now() });
  assert.equal(again.attempts.length, 2);
  await page.reload();
  await page.waitForSelector('.sheet-row');
  const listed = await page.evaluate(async () => (await import('/src/core/book.ts')).list());
  assert.equal(listed.length, 2);
  assert(!listed.some((x) => x.isCorrected));

  await session.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 1 });
  const image =
    'data:image/png;base64,' + readFileSync(path.join(process.env.SHITI_PAPERS, 'math-page-3.png')).toString('base64');
  // Chromium may already have reserved write space for the open IndexedDB connection.
  // Reopen both clients under the reduced origin quota before attempting a new image.
  await Promise.all([page.reload(), other.reload()]);
  await page.waitForSelector('.sheet-row');
  let committed = 2,
    rejected;
  // Some engines grant a small write reservation even when the next origin quota is zero.
  // Use actual cropped-work data on an isolated profile and bound the probe to 16 MiB.
  const maxWrites = Math.ceil((16 * 1024 * 1024) / image.length);
  for (let i = 0; i < maxWrites; i++) {
    const photo = { ...a, id: crypto.randomUUID(), img: image };
    try {
      await save(page, photo);
      committed++;
    } catch (error) {
      assert.match(error.message, /空间不足/);
      rejected = photo;
      break;
    }
  }
  assert(rejected, '未触及浏览器写入上限，不能认定容量故障验收通过。');
  assert.equal((await page.evaluate(async () => (await import('/src/core/book.ts')).list())).length, committed);
  await session.send('Storage.overrideQuotaForOrigin', { origin });
  await save(page, rejected);
  await other.waitForFunction((n) => document.querySelectorAll('.sheet-row').length === n, {}, committed + 1);
  console.log('额度调低后仍可提交', committed - 2, '条，下一条实际写入失败；解除限制后重试成功。');
}

async function verifyLegacyPhoto(browser, origin, row) {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    // Load a same-origin asset first so the app does not open the new schema yet.
    await page.goto(origin + '/brand/comma-ready.webp');
    const image = readFileSync(path.join(process.env.SHITI_PAPERS, 'math-page-3.png')).toString('base64');
    await page.evaluate(async (row, image) => {
      const old = await new Promise((resolve, reject) => {
        const r = indexedDB.open('shiti-family-live', 1);
        r.onupgradeneeded = () => {
          for (const name of ['questions', 'list']) r.result.createObjectStore(name, { keyPath: 'id' });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const bytes = Uint8Array.from(atob(image), c => c.charCodeAt(0));
      const attempts = [{ id: 'prior', paper: true, correct: false, date: 1, answer: '' }];
      const tx = old.transaction(['questions', 'list'], 'readwrite');
      tx.objectStore('questions').add({ ...row, img: new Blob([bytes], { type: 'image/png' }), attempts });
      tx.objectStore('list').add({ id: row.id, q: row.q, date: row.date, source: row.source, isCorrected: false });
      await new Promise((ok, no) => { tx.oncomplete = ok; tx.onabort = () => no(tx.error); });
      old.close();
    }, row, image);
    await page.goto(origin);
    await page.waitForSelector('.sheet-row');
    await page.click('.sheet-row');
    await page.click('.original-photo summary');
    await page.waitForFunction(() => document.querySelector('.original-photo img')?.naturalWidth > 0);
    const { click } = require('./browser-acceptance.cjs');
    for (const [answer, back] of [['这次做对了', '回到本题'], ['还要再练', '回本题看提示']]) {
      await page.click('.detail-correct');
      await click(page, '已在纸上做完，对照答案');
      await click(page, answer);
      await click(page, back);
    }
    await page.reload();
    await page.waitForSelector('.sheet-row');
    const state = await page.evaluate(async id => {
      const { get, list } = await import('/src/core/book.ts');
      const row = await get(id);
      return { attempts: row.attempts, imageSize: row.img.size, summary: (await list())[0] };
    }, row.id);
    assert.equal(state.attempts[0].id, 'prior');
    assert.deepEqual(state.attempts.map(a => a.correct), [false, true, false]);
    assert.equal(state.summary.mistakeCount, 3);
    assert.equal(state.summary.isCorrected, false);
    assert.equal(state.imageSize, Buffer.from(image, 'base64').length);
  } finally {
    await context.close();
  }
}

async function main() {
  const cases = JSON.parse(readFileSync(path.join(process.env.SHITI_PAPERS, 'cases.json')));
  const results = JSON.parse(readFileSync(process.env.SHITI_RESULTS));
  const rows = cases
    .filter((r) => r.subject === 'math')
    .slice(0, 2)
    .map((r) => {
      const lesson = results.find((e) => e.id === r.id && e.correct && e.lesson)?.lesson;
      assert(lesson, '需要真模型的完整结果');
      return {
        id: crypto.randomUUID(),
        date: Date.now(),
        q: r.text,
        source: '粘贴题目',
        child: '',
        teacher: '',
        img: '',
        lesson,
      };
    });
  const browser = await launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const pages = await Promise.all([browser.newPage(), browser.newPage()]);
    const origin = process.env.SHITI_ORIGIN || 'http://127.0.0.1:43872';
    const session = await pages[0].createCDPSession();
    await session.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 64 * 1024 });
    for (const page of pages) {
      await page.goto(origin);
      await page.waitForSelector('.empty-book');
    }
    await verifyLegacyPhoto(browser, origin, rows[0]);
    await verify(...pages, rows, session, origin);
    console.log('真实 IndexedDB 验收通过：旧记录、两页签并发、收录与订正幂等、再次订正、刷新、真实额度耗尽及恢复。');
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
