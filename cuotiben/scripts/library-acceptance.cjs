const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const { click, openRecord, switchModel } = require('./browser-acceptance.cjs');

async function collect(page, row, model) {
  await openRecord(page);
  await click(page, '粘贴题目');
  await page.focus('.manuscript textarea');
  await page.keyboard.sendCharacter(row.text);
  await click(page, '生成解析');
  await page.waitForSelector('.guidance .hint', { visible: true, timeout: 185000 });
  if (model !== 'doubao') {
    await switchModel(page, model);
    await page.waitForSelector('.guidance .hint', { visible: true, timeout: 185000 });
  }
  const error = await page.$('[role=alert]');
  if (error) throw Error(await error.evaluate(el => el.innerText));
  await click(page, '加入错题本');
  await page.waitForSelector('.sheet-row');
}
async function verify(page) {
  const cases = JSON.parse(fs.readFileSync(path.join(process.env.SHITI_PAPERS, 'cases.json')));
  await page.goto(process.env.SHITI_ORIGIN || 'http://localhost:43872');
  await page.waitForSelector('.empty-book');
  assert.equal(await page.$('.library-order'), null);
  await page.screenshot({path:'docs/qa/手机首页.png'});
  await openRecord(page);
  await page.goBack();
  await page.waitForSelector('.record-sheet', { hidden: true });
  await collect(page, cases.find(row => row.id === 'math-4'), 'doubao');
  await collect(page, cases.find(row => row.subject === 'eng'), 'openai/gpt-5.6-sol');
  await page.waitForFunction(() => document.querySelectorAll('.notebook-row').length === 2);
  const options = () => page.$$eval('.subject-filter option', opts => opts.map(o => o.value));
  assert.deepEqual(await options(), ['all', 'math', 'english']);
  await page.select('.subject-filter','math');
  await page.waitForFunction(() => document.querySelectorAll('.notebook-row').length === 1);
  await page.click('.quick-correct');
  await click(page, '已在纸上做完，对照答案');
  await click(page, '这次做对了');
  await click(page, '查看已订正题目');
  await page.waitForSelector('.sheet-row');
  assert.equal(await page.$eval('.subject-filter', e => e.value), 'math');
  assert.deepEqual(await page.$$eval('.filters b', a => a.map(b => b.textContent)), ['1','0','1']);
  await page.select('.subject-filter', 'english');
  await page.waitForSelector('.empty-book');
  await click(page, '开始订正');
  await page.waitForSelector('.correction-progress');
  await page.goBack();
  await page.waitForSelector('.subject-filter');
  assert.equal(await page.$eval('.subject-filter', e => e.value), 'english');
  await page.select('.subject-filter', 'all');
  await page.click('.filters button:first-child');
  assert.equal((await page.$$('.sheet-row')).length, 2);
  for (const width of [320, 390, 810]) {
    await page.setViewport({width, height:844});
    assert(await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.filters button')].map(el => el.getBoundingClientRect());
      const subject = document.querySelector('.subject-filter').getBoundingClientRect();
      return tabs.every(tab => tab.width >= 90 && tab.height >= 44) && subject.top >= tabs[0].bottom &&
        document.documentElement.scrollWidth <= innerWidth;
    }), '状态栏和学科布局异常 ' + width);
    if (width === 390) await page.screenshot({ path:'docs/qa/手机错题目录.png' });
  }
  // Reproduce the old schema with the same two actually saved records and their real lessons.
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('shiti-family-live'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
    });
    try { await new Promise((resolve,reject) => {
      const tx=db.transaction(['list','questions'],'readwrite');
      for (const name of ['list','questions']) {
        const cursor=tx.objectStore(name).openCursor();
        cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;
          if (item.value.subject==='math') { const row=item.value; delete row.subject; item.update(row); }
          item.continue();
        };
      }
      tx.oncomplete=resolve; tx.onabort=()=>reject(tx.error);
    }); } finally {db.close();}
  });
  await page.reload();
  await page.waitForSelector('.sheet-row');
  await page.select('.subject-filter', 'unknown');
  await page.click('.sheet-row');
  await page.waitForSelector('.settings-trigger', {visible:true});
  await page.click('.settings-trigger');
  await page.click('.subject-options button[value=math]');
  await page.waitForFunction(() => !document.querySelector('.job-state') && document.querySelector('.detail-subject')?.textContent === '数学');
  await page.reload();
  await page.waitForSelector('.sheet-row');
  await page.select('.subject-filter','math');
  assert.match(await page.$eval('.notebook-row .state',el=>el.textContent),/已订正/);
  assert(!(await options()).includes('unknown'));
  const reduced = await page.browser().createBrowserContext();
  try {
    const tab=await reduced.newPage();
    await tab.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await tab.goto(process.env.SHITI_ORIGIN || 'http://localhost:43872', {waitUntil:'networkidle0'});
    assert.equal(await tab.$('.book-heading .result-motion svg'),null);
    assert(!await tab.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.endsWith('/motion/opening.json'))));
  } finally {await reduced.close();}
}
(async () => {
  const browser=await launch({headless:true,executablePath:process.env.CHROME_PATH});
  try {
    const p=await browser.newPage();
    await p.setViewport({width:390,height:844});
    await verify(p);
    console.log('两科真题分类、状态交叉筛选、快捷订正、旧题补学科、刷新与减少动态效果均通过。');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
