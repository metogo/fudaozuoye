const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const { click, openRecord } = require('./browser-acceptance.cjs');

async function notebook(page) {
  return page.evaluate(async () => {
    const read = request => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await read(indexedDB.open('shiti-family-live'));
    try {
      const tx = db.transaction(['list', 'questions', 'reviews']);
      const [summaries, questions, reviews] = await Promise.all(
        ['list', 'questions', 'reviews'].map(name => read(tx.objectStore(name).getAll()))
      );
      return summaries.sort((a, b) => b.date - a.date).map(summary => {
        const { id, q, lesson, attempts } = questions.find(row => row.id === summary.id);
        const history = reviews.find(row => row.id === id);
        return { id, q, subject: summary.subject, lesson, attempts: history?.attempts ?? attempts, summary };
      });
    } finally { db.close(); }
  });
}

async function checkHome(page) {
  const rows = await notebook(page);
  const ui = await page.evaluate(() => ({
    subject: document.querySelector('.subject-filter')?.value || 'all',
    tab: document.querySelector('.filters [aria-pressed=true]').textContent.trim().split(/\s/)[0],
    counts: [...document.querySelectorAll('.filters b')].map(e => Number(e.textContent)),
    entries: [...document.querySelectorAll('.notebook-row')].map(el => ({
      done: el.querySelector('.state').textContent === '已订正',
      times: Number.parseInt(el.querySelector('.mistake-count').textContent),
      quick: !!el.querySelector('.quick-correct'),
    })),
  }));
  for (const row of rows) {
    assert.equal(row.summary.isCorrected, row.attempts.at(-1)?.correct === true);
    assert.equal(row.summary.mistakeCount, 1 + row.attempts.filter(a => !a.correct).length);
    assert.equal(row.summary.subject, row.subject);
  }
  const group = rows.filter(row => ui.subject === 'all' || row.subject === ui.subject);
  const passed = group.filter(row => row.summary.isCorrected).length;
  assert.deepEqual(ui.counts, [group.length, group.length - passed, passed]);
  const visible = group.filter(row => ui.tab === '全部' || row.summary.isCorrected === (ui.tab === '已订正'));
  assert.deepEqual(ui.entries, visible.map(({summary}) => ({
    done: summary.isCorrected, times: summary.mistakeCount, quick: !summary.isCorrected,
  })));
  return rows;
}

async function record(page, sample) {
  await openRecord(page);
  await click(page, '粘贴题目');
  await page.focus('.manuscript textarea');
  await page.keyboard.sendCharacter(sample.text);
  await click(page, '生成解析');
  await page.waitForFunction(() => document.querySelector('.save-dock') ||
    (!document.querySelector('.job-state') && document.querySelector('[role=alert]')), {timeout: 185000});
  const alert = await page.$('[role=alert]');
  if (alert) throw Error(await alert.evaluate(e => e.textContent));
  await click(page, '加入错题本');
  await page.waitForSelector('.collection-feedback');
  await page.waitForFunction(() => document.querySelector('.sheet-row'));
}

async function correct(page, row, index) {
  const target = (await notebook(page)).findIndex(r => r.id === row.id);
  const card = (await page.$$('.notebook-row'))[target];
  const quick = index % 2 === 0 && !row.summary.isCorrected;
  if (quick) await (await card.$('.quick-correct')).click();
  else {
    await (await card.$('.sheet-row')).click();
    await page.waitForSelector('.detail-correct');
    if (index % 3 === 0) {
      await click(page, '看提示');
      await click(page, '看下一步');
      await page.waitForSelector('.step', {visible:true, timeout:3500});
    }
    await click(page, '看完整解析');
    await page.waitForSelector('.self-check', {visible:true});
    await page.click('.detail-correct');
  }
  const paper = index % 3 === 1;
  const answer = row.lesson.answer || row.lesson.steps.at(-1);
  if (!paper) {
    await page.waitForSelector('.answer-input');
    await page.focus('.answer-input');
    await page.keyboard.sendCharacter(answer);
  }
  await click(page, paper ? '已在纸上做完，对照答案' : '对照答案');
  await page.waitForSelector('.comparison-steps');
  await page.click('.comparison-steps summary');
  assert(await page.$('.comparison-steps[open]'));
  const ok = index % 4 !== 0;
  await click(page, ok ? '这次做对了' : '还要再练');
  await page.waitForSelector('.success');
  const history = [...row.attempts];
  const updated = (await notebook(page)).find(r => r.id === row.id);
  assert.deepEqual(updated.attempts.slice(0,-1),history);
  assert.equal(updated.attempts.length,history.length+1);
  assert.deepEqual([updated.attempts.at(-1).correct,updated.attempts.at(-1).paper,updated.attempts.at(-1).answer],
    [ok,paper,paper ? '' : answer]);
  assert.equal(new Set(updated.attempts.map(a=>a.id)).size,updated.attempts.length);
  const verdict = await page.$eval('.receipt-body .softline', el => el.textContent);
  assert(verdict.includes('订正 ' + updated.attempts.length + ' 次，自评做对 ' + updated.attempts.filter(a=>a.correct).length + ' 次'));
  await click(page, ok ? '查看已订正题目' : '查看待订正题目');
  await page.waitForSelector('.sheet-row');
  await checkHome(page);
  await page.reload();
  await page.waitForSelector('.sheet-row');
  const rows = await checkHome(page);
  assert.deepEqual(rows.find(r=>r.id===row.id).attempts,updated.attempts);
  return {entry:quick?'快捷订正':'详情',answerMode:paper?'纸上':'文字',ok,attempts:updated.attempts.length,
    counts:await page.$$eval('.filters b',els=>els.map(el=>Number(el.textContent)))};
}

async function main() {
  const live = process.argv.includes('--live');
  const origin = process.env.SHITI_ORIGIN || 'http://localhost:43872';
  const cases = JSON.parse(readFileSync(path.join(process.env.SHITI_PAPERS,'cases.json')));
  const rounds = Number(process.env.SHITI_ROUNDS || 20);
  const browser=await launch({headless:true,executablePath:process.env.CHROME_PATH});
  const report=[];
  try {
    const p=await browser.newPage();
    const errors=[]; p.on('pageerror', e=>errors.push(e.message));
    await p.goto(origin + (live ? '/' : '/scripts/preview/notebook.html'));
    await p.waitForSelector(live ? '.empty-book' : '.sheet-row');
    for(let i=0;i<rounds;i++) {
      const started=Date.now();
      await p.setViewport({width:[393,320,430,810][i%4],height:844});
      const before = await checkHome(p);
      const sample = cases[[3,0,6,5,1,7,4,2,8][i%9]];
      if(live) await record(p,sample);
      const rows = await checkHome(p);
      const row = live ? rows.find(r=>!before.some(old=>old.id===r.id)) : rows[i%rows.length];
      if(live) {
        assert.equal(rows.length,before.length+1);
        assert.equal(row.q,sample.text.trim());
        assert.equal(row.lesson.provider,'doubao');
        const expected = {math:'math',chi:'chinese',eng:'english'}[sample.subject];
        assert([expected, 'unknown'].includes(row.subject), '错题不能被归入不相关的学科：' + row.subject);
        if (row.subject === 'unknown') {
          await p.select('.subject-filter', 'unknown');
          await checkHome(p);
          await p.select('.subject-filter', 'all');
        }
      }
      const result = await correct(p,row,i);
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);
      report.push({round:i+1,question:live?sample.id:row.id,model:row.lesson.modelId,subject:row.subject,ms:Date.now()-started,...result});
      if(process.env.SHITI_REPORT) writeFileSync(process.env.SHITI_REPORT,JSON.stringify(report,null,2));
      console.log('通过',i+1,report.at(-1).question,result.counts.join('/'));
    }
  } catch(error) {
    const p=(await browser.pages()).at(-1);
    console.error('当前页面', await p.$eval('main', el=>el.innerText.slice(-900)));
    throw error;
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
