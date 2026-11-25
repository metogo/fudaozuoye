const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const { click, openRecord, switchModel } = require('./browser-acceptance.cjs');

async function measure(board, model, question, interrupt) {
  await board.reload();
  await openRecord(board);
  await click(board, '粘贴题目');
  await board.focus('textarea');
  await board.keyboard.sendCharacter(question);
  if (model !== 'doubao') {
    await click(board, '生成解析');
    await board.waitForSelector('.guidance .hint', {visible:true, timeout:185000});
  }
  let retried = false;
  const start = () => model === 'doubao' ? click(board, retried ? '重新解析' : '生成解析') : switchModel(board, model);
  if (interrupt) {
    await start();
    await board.waitForSelector('.live-hint p', { visible: true, timeout: 185000 });
    await click(board, '返回');
    await board.waitForSelector('[role=alert]');
    assert.match(await board.$eval('[role=alert]', el => el.textContent), /取消/);
    assert(await board.$('.reader-edit'));
    assert.equal(await board.$('.live-lesson'), null);
    retried = true;
  }
  await board.evaluate(() => {
    const start = performance.now();
    let last = '';
    window.streamEvidence = { updates: 0, detailVisible: false, earlySave: false };
    const observer = new MutationObserver(() => {
      const box = document.querySelector('.live-lesson');
      if (box) {
        const text = box.querySelector('.live-hint p')?.textContent;
        if (text && text !== last) {
          last = text;
          window.streamEvidence.firstTextMs ??= Math.round(performance.now() - start);
          window.streamEvidence.updates++;
        }
        if (box.querySelector('.live-solution .preserve')?.getClientRects().length) window.streamEvidence.detailVisible = true;
        if (document.querySelector('.save-dock')?.getClientRects().length) window.streamEvidence.earlySave = true;
      }
      if (window.streamEvidence.updates && document.querySelector('.guidance .hint')?.getClientRects().length) {
        window.streamEvidence.completeMs = Math.round(performance.now() - start);
        observer.disconnect();
      }
    });
    observer.observe(document.querySelector('main'), { childList: true, subtree: true, characterData: true });
  });
  const mime = new Set();
  const response = r => {
    if (r.request().method() === 'POST' && r.headers()['content-type']?.includes('text/event-stream'))
      mime.add(new URL(r.url()).pathname);
  };
  board.on('response', response);
  try {
    await start();
    await board.waitForFunction(() => !document.querySelector('.live-lesson') && document.querySelector('.guidance .hint, [role=alert]'), { timeout: 185000 });
    const problem = await board.$('[role=alert]');
    if (problem) throw Error(await problem.evaluate(el => el.textContent));
    const stats = await board.evaluate(() => window.streamEvidence);
    assert(stats.updates >= 1 && stats.firstTextMs < stats.completeMs && !stats.earlySave, JSON.stringify(stats));
    const { notebookOrigins } = await import('../shared/notebook-origins.js');
    const direct = model === 'doubao' && notebookOrigins.has(new URL(board.url()).origin);
    assert(mime.has(direct ? '/cuotiben-ai' : '/api/notebook'));
    assert(stats.detailVisible, '完整解题过程应随模型输出自动显示');
    assert(await board.$('.self-check'), '生成结束应直接展示自检');
    await board.waitForFunction(() => document.querySelector('.guidance')?.textContent.includes('835'));
    return { model, ...stats, interruptedAndRetried: interrupt, sse: [...mime] };
  } finally { board.off('response', response); }
}

async function main() {
  const question = JSON.parse(fs.readFileSync(path.join(process.env.SHITI_PAPERS, 'cases.json'))).find(row => row.id === 'math-4').text;
  const { models } = await import('../shared/models.js');
  const browser = await launch({ headless: true, executablePath: process.env.CHROME_PATH });
  let failed = false;
  try {
    const board = await browser.newPage();
    await board.setViewport({ width: 390, height: 844 });
    await board.goto(process.env.SHITI_ORIGIN || 'http://localhost:43872');
    for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['doubao', ...models.map(row => row.id)]) {
      try { console.log(JSON.stringify(await measure(board, id, question, process.env.SHITI_VERIFY_CANCEL === '1'))); }
      catch (error) { failed = true; console.error(id, error.message); }
    }
  } finally { await browser.close(); }
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
