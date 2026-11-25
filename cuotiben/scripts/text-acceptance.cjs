const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { click, choosePhoto, openRecord } = require('./browser-acceptance.cjs');

async function setText(page, field, value) {
  await field.evaluate((el) => { el.focus(); el.select(); });
  await page.keyboard.sendCharacter(value);
  await page.keyboard.press('Tab');
}
async function result(page) {
  const settled = () => page.waitForFunction(() => document.querySelector('.hint, [role=alert]') && !document.querySelector('.job-state'), { timeout: 185000 });
  await settled();
  const alert = await page.$('[role=alert]');
  if (alert && /过于频繁/.test(await alert.evaluate(el => el.textContent))) {
    console.log('收到真实限流提示，保留原题，稍后通过重新解析恢复。');
    await new Promise(resolve => setTimeout(resolve, 60000));
    await click(page, '重新解析');
    await settled();
  }
  assert(await page.$('.hint'), await page.$eval('main', (el) => el.innerText.slice(-200)));
}
async function verify(page, cases, original) {
  const button = (name) => click(page, name);
  await page.waitForSelector('.empty-book');
  await openRecord(page);
  await button('粘贴题目');
  const [first, second] = cases.filter((x) => x.subject === 'math');
  const message = [first, second].map((row, i) => (i + 4) + '. ' + row.text + '\n参考答案：' + row.reference).join('\n');
  await page.$eval('.manuscript textarea', (field, text) => {
    field.focus();
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    field.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  }, message);
  const choices = await page.$$('.question-choices button');
  assert.equal(choices.length, 2);
  await choices[1].click();
  const fields = await page.$$('textarea');
  assert((await fields[0].evaluate((el) => el.value)).includes(second.text));
  assert.equal(await fields[1].evaluate((el) => el.value), '');
  assert.equal(await fields[2].evaluate((el) => el.value), second.reference);
  await page.waitForSelector('#answer-fields:not([hidden]) textarea', { visible: true });
  await choosePhoto(page, '改用截图圈题');
  assert((await page.$eval('textarea', (el) => el.value)).includes(second.text));
  await button('返回');
  await button('放弃并返回');

  await openRecord(page);
  await button('粘贴题目');
  await setText(page, await page.$('textarea'), original.q);
  await button('生成解析');
  await result(page);
  const generic = await page.$eval('.hint p', (el) => el.textContent);
  await button('补充孩子的原作答');
  await page.waitForFunction(() => document.activeElement === document.querySelectorAll('textarea')[1]);
  await page.keyboard.sendCharacter(original.child);
  await button('生成解析');
  await result(page);
  assert.equal(await page.$eval('.child-note p', (el) => el.textContent), original.child);
  assert.notEqual(await page.$eval('.hint p', (el) => el.textContent), generic);
  await page.waitForSelector('.self-check', {visible:true});
  await page.waitForFunction(() => !document.querySelector('.formula-loading'));
  const steps = await page.$$eval('.step p', (nodes) => nodes.map((el) => el.textContent.trim()));
  assert(steps.every((step) => !/^(分步推导|解题步骤|结论|解题思路)[：:]?$/.test(step)));
  assert.match(steps.join(''), /2000|2,000|2\s*000/);
  await button('加入错题本');
  await page.waitForSelector('.sheet-row');
  await page.reload();
  await page.waitForSelector('.sheet-row');
  assert.equal((await page.$$('.sheet-row')).length, 1);
  await page.click('.sheet-row');
  await page.waitForSelector('.detail-correct', {visible:true});
  assert.equal(await page.$('.hint, .child-note'), null);
  await button('去订正');
  await button('已在纸上做完，对照答案');
  assert.match(await page.$eval('.child-note', el => el.textContent), /已在纸上完成/);
  await button('这次做对了');
  await page.waitForSelector('.success');
  assert.match(await page.$eval('.success', (el) => el.innerText), /订正 1 次，自评做对 1 次/);
  return { source: 'MCAS 2025 Grade 4 Math Q14 Part B', model: '豆包', steps: steps.length, generic, child: original.child };
}
async function missingFigure(page) {
  const paper = fs.readFileSync(path.join(process.env.SHITI_PAPERS, 'math.txt'), 'utf8');
  const question = paper.match(/14\.\s+(下圖[^\n]+？)/)[1];
  const button = (label) => click(page, label);
  await openRecord(page);
  await button('粘贴题目');
  await setText(page, await page.$('textarea'), question);
  await button('生成解析');
  await page.waitForFunction(() => !document.querySelector('.job-state') && document.querySelector('[role=alert],.hint'), { timeout: 185000 });
  assert(await page.$('[role=alert]'), '缺图时生成了讲解');
  assert.match(await page.$eval('[role=alert]', (el) => el.innerText), /图|圖|阴影|陰影/);
  assert.equal(await page.$('.hint'), null);
  await choosePhoto(page, '改用截图圈题');
  assert.equal(await page.$eval('textarea', (el) => el.value), question);
  // Visual transcription of the eight sectors on page 6 of the same released paper.
  await setText(page, await page.$('textarea'), question + '\n圖中八邊形平均分成8份，其中5份塗了色。');
  await button('生成解析');
  await result(page);
  await page.waitForSelector('.self-check', {visible:true});
  await page.waitForFunction(() => !document.querySelector('.formula-loading'));
  const solution = await page.$eval('.solution-steps', (el) => el.textContent);
  assert.match(solution, /(?:5\s*[/／]\s*8|八分之五|\\(?:d?frac)\s*\{5\}\s*\{8\})/u);
}
async function main() {
  const origin = process.env.SHITI_ORIGIN || 'http://localhost:43872';
  const cases = JSON.parse(fs.readFileSync(path.join(process.env.SHITI_PAPERS, 'cases.json')));
  const original = JSON.parse(fs.readFileSync(process.env.SHITI_STUDENT_WORK || path.join(__dirname, '../docs/qa/公开学生作答.json'))).find((row) => row.id === 'B');
  const browser = await launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(origin);
    const obtained = await verify(page, cases, original);
    const second = await browser.createBrowserContext();
    const visitor = await second.newPage();
    await visitor.goto(origin);
    await visitor.waitForSelector('.empty-book');
    assert.equal((await visitor.$$('.sheet-row')).length, 0);
    await missingFigure(visitor);
    console.log(obtained.source, obtained.model, obtained.steps, '个有正文的步骤；收录后订正一次，独立访客为空本；缺图时要求补图、取消选图仍保留原文。');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
