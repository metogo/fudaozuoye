const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const { click, openRecord } = require('./browser-acceptance.cjs');

async function measureFollow(p) {
  await p.waitForFunction(() => scrollY > 65 && document.querySelector('.live-solution'), { timeout: 180000 });
  const moving = await p.$eval('.live-lesson', el => ({ y: scrollY, tail: el.getBoundingClientRect().bottom, h: innerHeight }));
  assert(moving.tail < moving.h + 100, JSON.stringify(moving));
  await p.mouse.wheel({ deltaY: -60 });
  await p.waitForSelector('.follow-latest', { visible: true });
  const paused = await p.$eval('.live-solution', el => ({ y: scrollY, size: el.textContent.length }));
  await p.waitForFunction(size => document.querySelector('.live-solution')?.textContent.length > size + 8, {}, paused.size);
  assert(await p.evaluate(y => scrollY <= y + 2, paused.y), '新内容打断了手动阅读');
  await p.click('.follow-latest');
  await p.waitForSelector('.follow-latest', { hidden: true });
  await p.waitForFunction(() => !document.querySelector('.live-lesson') && !!document.querySelector('.self-check'), {timeout: 180000});
}

async function verifyRuler(p) {
  const ruler = await p.waitForSelector('.step-ruler', { visible: true });
  const last = await ruler.evaluate(el => +el.getAttribute('aria-valuemax'));
  assert.equal(last, (await p.$$('.result-reader .step')).length + 1);
  const active = () => ruler.evaluate(el => +el.getAttribute('aria-valuenow'));
  for (const width of [320, 393, 810]) {
    await p.setViewport({ width, height: 640, deviceScaleFactor: 2, hasTouch: true });
    const stops = await (await p.$('.ruler-stops')).boundingBox();
    const x = stops.x + stops.width / 2;
    await p.touchscreen.touchStart(x, stops.y);
    for (let i = 0; i <= last; i++) {
      await p.touchscreen.touchMove(x, stops.y + stops.height * i / last);
      await p.waitForFunction(n => +document.querySelector('.step-ruler').getAttribute('aria-valuenow') === n, {}, i);
      const position = await p.evaluate(index => {
        const part = document.querySelectorAll('.result-reader [data-part]')[index];
        return { top: part.getBoundingClientRect().top, bottom: scrollY + innerHeight >= document.documentElement.scrollHeight - 2 };
      }, i);
      assert(position.bottom || Math.abs(position.top - 24) < 3, JSON.stringify(position));
    }
    if (width === 393) {
      await p.touchscreen.touchMove(x, stops.y + stops.height / last);
      await p.screenshot({ path: 'docs/qa/解析步骤尺-手机.png' });
    }
    await p.touchscreen.touchEnd();
    await p.waitForFunction(() => document.querySelector('.step-ruler').dataset.engaged === 'false');
    await ruler.focus();
    await p.keyboard.press('Home');
    await p.keyboard.press('ArrowDown');
    assert.equal(await active(), 1);

    await p.keyboard.press('End');
    assert.equal(await active(), last);
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
}
async function main() {
  const q = JSON.parse(fs.readFileSync(path.join(process.env.SHITI_PAPERS, 'cases.json'))).find(row => row.id === 'math-5').text;
  const browser = await launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const p = await browser.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.setViewport({ width: 320, height: 345, hasTouch: true });
    await p.goto(process.env.SHITI_ORIGIN || 'http://localhost:43872');
    await openRecord(p);
    await click(p, '粘贴题目');
    await p.focus('textarea');
    await p.keyboard.sendCharacter(q);
    await click(p, '生成解析');
    await measureFollow(p);
    await verifyRuler(p);
    await click(p, '加入错题本');
    await p.waitForSelector('.sheet-row');
    assert.equal(await p.$('.step-ruler'), null);
    await p.click('.sheet-row');
    await click(p, '看完整解析');
    await p.waitForSelector('.step-ruler', { visible: true });
    assert.deepEqual(errors, []);
    console.log('公开数学原题 · SSE 跟随、暂停、继续、步骤触控与键盘定位、收录通过');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
