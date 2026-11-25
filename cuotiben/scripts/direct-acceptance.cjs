const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const { click, choosePhoto, openRecord, switchModel } = require('./browser-acceptance.cjs');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shiti-single-'));
  const prefix = path.join(tmp, 'paper-question-6');
  execFileSync('pdftoppm', ['-f', '3', '-l', '3', '-r', '144', '-x', '128', '-y', '884',
    '-W', '842', '-H', '90', '-png', '-singlefile', path.join(process.env.SHITI_PAPERS, 'math.pdf'), prefix]);
  const browser = await launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const p = await browser.newPage();
    const origin = process.env.SHITI_ORIGIN || 'http://localhost:43872';
    await p.setViewport({ width: 390, height: 844 });
    await p.goto(origin);
    await p.waitForSelector('.empty-book');
    await p.evaluate(() => {
      window.clicks = [];
      document.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (button) window.clicks.push(button.textContent.trim());
      });
    });
    await choosePhoto(p, '从相册选', prefix + '.png');
    await click(p, '解析整张图');
    await p.waitForSelector('.live-lesson', { visible: true });
    await p.waitForSelector('.work-result .guidance .hint', { visible: true, timeout: 185000 });
    assert.equal(await p.$('.manuscript textarea,.review-submit'), null);
    assert.equal(await p.$('.work-result .question-sheet'), null);
    assert(await p.$('.result-reader > .guidance:first-child'));
    assert(!(await p.$('.original-photo[open]')));
    await p.click('.original-photo summary');
    await p.waitForFunction(() => document.querySelector('.original-photo[open] img')?.naturalWidth > 0);
    await p.click('.original-photo summary');
    await p.setViewport({ width: 1280, height: 800 });
    assert(await p.$eval('.guidance', el => el.clientWidth > 0 && el.clientWidth < 800));
    await p.setViewport({ width: 320, height: 568 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await click(p, '加入错题本');
    await p.waitForSelector('.sheet-row');
    assert.equal((await p.$$('.sheet-row')).length, 1);
    const taps = await p.evaluate(() => window.clicks);
    assert.deepEqual(taps, ['录题', '从相册选', '解析整张图', '加入错题本']);
    const saved = await p.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('shiti-family-live');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const query = db.transaction('questions').objectStore('questions').getAll();
          query.onsuccess = () => resolve(query.result[0]);
          query.onerror = () => reject(query.error);
        });
      } finally { db.close(); }
    });
    assert.equal(saved.lesson.provider, 'doubao');
    assert.equal(saved.subject, 'math');
    assert.match(saved.q, /764/);
    assert.match(saved.lesson.steps.at(-1), /764/);
    // Reuse the actual printed multiplication expression with math delimiters for the clipboard flow.
    const expression = /\\times/.test(saved.q) ? saved.q : saved.q.replace(/×/g, '\\times');
    const formatted = /\$|\\\(/.test(expression) ? expression : '\\(' + expression + '\\)';
    await openRecord(p);
    await click(p, '粘贴题目');
    await p.focus('.manuscript textarea');
    await p.evaluate(value => {
      const data = new DataTransfer();
      data.setData('text/plain', value);
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, formatted);
    await p.waitForSelector('.live-lesson', { visible: true });
    await p.waitForSelector('.work-result .guidance .hint', { visible: true, timeout: 185000 });
    assert.equal(await p.$('.original-photo'), null);
    const alternate = 'openai/gpt-5.6-sol';
    await switchModel(p, alternate);
    await p.waitForSelector('.live-lesson', { visible: true });
    await p.waitForFunction(id => document.querySelector('.model-option[aria-pressed=true]')?.value === id &&
      !document.querySelector('.live-lesson') && !document.querySelector('[role=alert]'), {timeout:185000}, alternate);
    assert.equal(await p.$('.manuscript textarea'), null);
    await click(p, '修改题目');
    assert.equal(await p.$eval('.manuscript textarea', e => e.value), formatted);
    console.log(taps.join(' → '), '；默认豆包真题入本，电子公式粘贴和源文编辑通过。');
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
