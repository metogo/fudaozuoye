const assert = require('node:assert/strict');
const path = require('node:path');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const { click, circle, choosePhoto } = require('./browser-acceptance.cjs');

async function main() {
  const browser = await launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 390, height: 844 });
    await p.goto(process.env.SHITI_ORIGIN || 'http://localhost:43872');
    const button = (name) => click(p, name);
    const uploads = [];
    p.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/learning/analyze')) uploads.push(request.url());
    });
    await choosePhoto(p, '拍照圈题');
    await choosePhoto(p, '从相册选', path.join(process.env.SHITI_PAPERS, 'math-page-3.png'));
    await circle(p, 64, 146, 485, 185);
    assert.equal(uploads.length, 0);
    await button('解析框内题目');
    const stem = async () => {
      await p.waitForSelector('.guidance .hint', { visible: true, timeout: 185000 });
      await p.click('.result-reader .original-photo summary');
      await button('修改题目');
      return p.$eval('.manuscript textarea', (el) => el.value);
    };
    const reframe = async () => {
      if (!(await p.$('.original-photo[open]'))) await p.click('.original-photo summary');
      await button('重新圈题');
    };
    const first = await stem();
    assert.match(first, /436.*157.*242/s);
    const initialUploads = uploads.length;
    const cachedStart = Date.now();
    await reframe();
    await button('解析框内题目');
    assert.equal(await stem(), first);
    assert.equal(uploads.length, initialUploads);
    console.log('同一选区回到解析再打开核对，新增分析请求 0，耗时', Date.now() - cachedStart, 'ms');
    await reframe();
    await circle(p, 64, 442, 485, 487);
    await p.setOfflineMode(true);
    await button('解析框内题目');
    await p.waitForSelector('.manual-transcript');
    await button('对照选区手动填写');
    await p.waitForSelector('textarea');
    assert.equal(await p.$eval('textarea', (e) => e.value), '');
    await p.setOfflineMode(false);
    await reframe();
    await button('解析框内题目');
    const second = await stem();
    assert.match(second, /764/);
    assert(!second.includes('436'));
    console.log('取消前无上传，同一选区返回无二次识别，断网后可对照题图补录，重新圈题后使用新题干。');
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
