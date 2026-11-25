const path = require('node:path');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const inputs = process.env.SHITI_PAPERS;
if (!inputs) throw Error('请设置 SHITI_PAPERS 为公开原卷和 cases.json 所在目录。');
const assert = require('node:assert/strict'),
  fs = require('node:fs');
async function captureLayouts(page, name) {
  const dir = process.env.SHITI_GALLERY_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  const viewport = page.viewport(),
    scroll = await page.evaluate(() => scrollY);
  if (['做对', '收录'].includes(name)) {
    await page.waitForSelector('.result-motion svg');
    // Capture the final state once the longest non-looping response (650 ms) settles.
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  for (const [width, height] of [
    [320, 720],
    [390, 844],
    [810, 1080],
    [1143, 690],
  ]) {
    await page.setViewport({ width, height });
    await page.evaluate(async () => {
      scrollTo(0, 0);
      await Promise.all(Array.from(document.images, (image) => image.decode()));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' 超出宽度 ' + width);
    const source = await page.$('.study-source'),
      task = await page.$('.study-task');
    if (source && task) {
      const a = await source.boundingBox(),
        b = await task.boundingBox();
      assert(width >= 761 ? b.x >= a.x + a.width - 1 : b.y >= a.y + a.height - 1, name + ' 题目与任务区域位置错误');
    }
    if (width === 390 || width === 1143) await page.screenshot({ path: path.join(dir, width + '-' + name + '.png') });
  }
  await page.setViewport(viewport);
  await page.evaluate((n) => scrollTo(0, n), scroll);
}
async function click(p, label) {
  await p.waitForFunction(
    (s) =>
      Array.from(document.querySelectorAll('button')).some(
        (b) => !b.disabled && (b.getAttribute('aria-label') === s || b.textContent.trim() === s || b.querySelector('strong')?.textContent === s),
      ),
    { timeout: 15000 },
    label,
  );
  const b = await p.evaluateHandle(
    (s) =>
      Array.from(document.querySelectorAll('button')).find(
        (b) => b.getAttribute('aria-label') === s || b.textContent.trim() === s || b.querySelector('strong')?.textContent === s,
      ),
    label,
  );
  assert(b.asElement(), label);
  // A sticky dock may cover a visible button near the edge. Scroll as a touch user would.
  await b.evaluate(el => el.scrollIntoView({block:'center', inline:'nearest', behavior:'instant'}));
  await b.asElement().click();
}
async function openRecord(p) {
  if (!await p.$('.record-sheet[open]')) await p.click('.record-trigger');
  await p.waitForSelector('.record-sheet[open]');
}
async function choosePhoto(p, label, file) {
  if (label !== '改用截图圈题') await openRecord(p);
  const [chooser] = await Promise.all([p.waitForFileChooser(), click(p, label)]);
  await chooser.accept(file ? [file] : []);
}
async function paperPosition(p) {
  await p.waitForSelector('canvas[data-ready=true]');
  return p.$eval('canvas', (c) => {
    const b = c.getBoundingClientRect();
    const scale = Math.min((b.width - 16) / 595.32, (b.height - 16) / 841.92);
    return { x: b.left + (b.width - 595.32 * scale) / 2, y: b.top + (b.height - 841.92 * scale) / 2, scale };
  });
}
async function circle(p, left, top, right, bottom) {
  const box = await paperPosition(p);
  await p.mouse.move(box.x + left * box.scale, box.y + top * box.scale);
  await p.mouse.down();
  await p.mouse.move(box.x + right * box.scale, box.y + bottom * box.scale, { steps: 12 });
  await p.mouse.up();
}
async function switchModel(page, model) {
  const target = await page.waitForSelector('.model-option[value="' + model + '"]:enabled', { visible: true });
  await target.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await target.click();
  await page.waitForSelector('dialog[open] .primary');
  await page.click('dialog[open] .primary');
}
async function verifyPaste(p, button, cases) {
  await openRecord(p);
  await button('粘贴题目');
  await captureLayouts(p, '粘贴');
  for (const row of cases) {
    await p.$eval('textarea', (e) => {
      e.focus();
      e.select();
    });
    await p.keyboard.sendCharacter(row.text);
    await p.keyboard.press('Tab');
    assert.equal((await p.$eval('textarea', (e) => e.value)).trim(), row.text.trim());
  }
  await p.$eval('textarea', (e) => {
    e.focus();
    e.setSelectionRange(2, 2);
  });
  await p.goBack();
  await p.waitForSelector('dialog');
  await captureLayouts(p, '退出确认');
  await button('继续编辑');
  assert.equal(await p.$eval('textarea', (e) => e.value), cases.at(-1).text);
  await p.waitForFunction(
    () => document.activeElement === document.querySelector('textarea') && document.activeElement.selectionStart === 2,
  );
  await button('返回');
  await button('放弃并返回');
}
async function collectPhotos(p, button) {
  await choosePhoto(p, '拍照圈题');
  await choosePhoto(p, '从相册选', path.join(inputs, 'math-page-3.png'));
  await p.waitForSelector('canvas[data-ready=true]');
  assert.equal(await p.$eval('.footer-act button', (el) => el.textContent), '解析整张图');
  await circle(p, 64, 146, 485, 185);
  await captureLayouts(p, '圈题');
  assert.equal(await p.$eval('.footer-act button', (b) => b.disabled), false);

  await button('解析框内题目');
  const hint = () => p.waitForSelector('.guidance .hint', {visible:true, timeout:185000});
  const crop = async () => {
    await p.$eval('.result-reader .original-photo', el => { el.open = true; });
    await p.waitForSelector('.result-reader .proof');
    return p.$eval('.result-reader .proof', el => el.src);
  };
  await hint();
  const firstCrop = await crop();
  const model = 'openai/gpt-5.6-sol';
  await p.waitForFunction(() => document.querySelectorAll('.model-option:enabled').length === 5);
  const requested = [];
  const observe = req => {
    if (req.method() === 'POST' && req.url().endsWith('/api/notebook')) requested.push(req.url());
  };
  p.on('request', observe);
  try {
    await button('GPT-5.6 Sol');
    await p.waitForSelector('dialog[open]');
    assert.match(await p.$eval('#dialog-description', el => el.textContent), /豆包.*GPT-5.6 Sol/);
    await button('暂不切换');
    await p.waitForSelector('dialog[open]', { hidden: true });
    assert.equal(await p.$eval('.model-option[aria-pressed=true]', el => el.value), 'doubao');
    assert.deepEqual(requested, []);
  } finally {
    p.off('request', observe);
  }
  await p.setOfflineMode(true);
  await switchModel(p, model);
  await p.waitForFunction(() => document.querySelector('[role=alert]')?.textContent.includes('网络连接失败'));
  assert.equal(await crop(), firstCrop);
  await p.setOfflineMode(false);
  const inFlight = p.waitForRequest(req => req.method() === 'POST' && req.url().endsWith('/api/notebook'));
  await switchModel(p, model);
  await inFlight;
  await button('返回');
  await p.waitForFunction(() => document.querySelector('[role=alert]')?.textContent.includes('操作已取消'));
  assert.equal(await crop(), firstCrop);
  await switchModel(p, model);
  await hint();
  assert.equal(await p.$eval('.hint', (e) => e.textContent.includes('835')), false);
  await p.screenshot({ path: 'docs/qa/手机真实讲解.png' });
  await p.waitForSelector('.self-check', {visible:true});
  await captureLayouts(p, '完整解析');
  await button('收录并圈下一题');
  await p.waitForSelector('.collection-feedback');
  await p.waitForSelector('.result-motion svg', { timeout: 10000 });
  await captureLayouts(p, '收录');
  assert.match(await p.$eval('.collection-feedback', el => el.textContent), /已收录 1 道/);
  assert.equal(await p.$eval('.footer-act button', el => el.textContent), '解析框内题目');
  await p.waitForSelector('canvas');
  const box = await paperPosition(p);
  await p.touchscreen.tap(box.x + 275 * box.scale, box.y + 465 * box.scale);
  await button('解析框内题目');
  await hint();
  assert.notEqual(await crop(), firstCrop);
  await switchModel(p, model);
  await hint();
  await button('加入错题本');
  await p.waitForSelector('.sheet-row');
  assert.equal((await p.$$('.sheet-row')).length, 2);
  const titles = await p.$$eval('.sheet-row', rows => rows.map(row => row.textContent));
  assert(titles.some(title => /436.*157.*242/s.test(title)));
  assert(titles.some(title => title.includes('764')));
}
async function verifyCorrections(p, button) {
  await (await p.$('.sheet-row')).click();
  await p.waitForSelector('.detail-correct');
  await captureLayouts(p, '复习');
  await button('去订正');
  await p.waitForSelector('.answer-input');
  await p.focus('.answer-input');
  await p.keyboard.sendCharacter('乘法交换律，所以填 764。');
  await captureLayouts(p, '重做');
  await button('对照答案');
  await captureLayouts(p, '对照');
  await button('这次做对了');
  await captureLayouts(p, '做对');
  await p.waitForSelector('.success');
  await button('查看已订正题目');
  await p.waitForSelector('.sheet-row');
  assert.equal((await p.$$('.sheet-row')).length, 1);
  await (await p.$('.sheet-row')).click();
  await button('再次订正');
  await button('已在纸上做完，对照答案');
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await button('还要再练');
  await p.waitForSelector('.success');
  await captureLayouts(p, '再练');
  await p.waitForSelector('.success');
  assert.equal(await p.$('.result-motion svg'), null);
  assert((await p.$eval('.success', (e) => e.textContent)).includes('本题订正 2 次，自评做对 1 次'));
  await button('回本题看提示');
  await captureLayouts(p, '再练提示');
  await p.waitForSelector('.hint');
  await p.waitForSelector('.settings-trigger', {visible:true});
  await p.click('.settings-trigger');
  await button('移除这道题');
  await button('保留');
  await p.waitForSelector('.hint');
  await p.reload();
  await p.waitForSelector('.sheet-row');
  assert.equal((await p.$$('.sheet-row')).length, 2);
  await p.setViewport({ width: 1280, height: 800 });
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await (await p.$('.sheet-row')).click();
  await p.waitForSelector('.settings-trigger', {visible:true});
  await p.click('.settings-trigger');
  await button('移除这道题');
  await button('确认移除');
  await p.waitForFunction(() => document.querySelectorAll('.sheet-row').length === 1);
  await p.reload();
  await p.waitForSelector('.sheet-row');
  assert.equal((await p.$$('.sheet-row')).length, 1);
}
async function main() {
  const browser = await launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 390, height: 844 });
    p.on('response', (r) => {
      if (r.url().includes('/api/notebook')) console.log(r.request().method(), r.status());
    });
    const errors = [],
      calls = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('request', (r) => calls.push(r.url()));
    await p.goto(process.env.SHITI_ORIGIN || 'http://127.0.0.1:43872');
    await p.waitForSelector('.empty-book');
    await p.waitForSelector('.book-heading .result-motion svg');
    await captureLayouts(p, '首页');
    await p.screenshot({ path: 'docs/qa/手机首页.png' });
    assert(calls.some(u => u.endsWith('/motion/opening.json')));
    const cases = JSON.parse(fs.readFileSync(path.join(inputs, 'cases.json')));
    const button = (label) => click(p, label);
    await verifyPaste(p, button, cases);
    await collectPhotos(p, button);
    await p.setViewport({ width: 1143, height: 548 });
    await p.screenshot({ path: 'docs/qa/平板真实题本.png', fullPage: true });
    await p.setViewport({ width: 390, height: 844 });
    await verifyCorrections(p, button);
    assert.deepEqual(errors, []);
    console.log(
      '真实浏览器：9 道公开题录入，3 科各 3；取消退出保留稿；公开原卷 PNG 圈题；拍照取消留在首页，真实识别后单份排版核对；首页展示小逗号形象。',
    );
  } finally {
    await browser.close();
  }
}
module.exports = { click, circle, choosePhoto, openRecord, switchModel };
if (require.main === module) main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
