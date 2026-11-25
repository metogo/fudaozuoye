const assert = require('node:assert/strict');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const { click } = require('./browser-acceptance.cjs');

async function write764(page) {
  const surface = await page.waitForSelector('.ink-workspace[open] .writable');
  const box = await surface.boundingBox();
  // Write the published answer to 9 × 764 = ___ × 9 with real pointer events.
  const strokes = [
    [[0,0],[38,0],[13,59]], [[91,0],[73,12],[64,32],[64,49],[75,59],[86,55],[92,43],[88,32],[78,26],[65,33]],
    [[140,0],[118,37],[155,37]], [[144,12],[144,59]],
  ];
  for (const stroke of strokes) {
    for (const [i,[x,y]] of stroke.entries()) {
      await page.mouse.move(box.x + 27 + x, box.y + 70 + y, {steps:i ? 4 : 1});
      if (!i) await page.mouse.down();
    }
    await page.mouse.up();
  }
  return strokes.length;
}
async function run(page) {
  await page.goto((process.env.SHITI_ORIGIN || 'http://localhost:43872') + '/scripts/preview/notebook.html');
  await page.waitForSelector('.sheet-row');
  await page.click('.sheet-row::-p-text(764)');
  await page.waitForSelector('.detail-correct');
  await page.click('.settings-trigger');
  await page.goBack();
  await page.waitForSelector('.subject-sheet:not([open])');
  await page.waitForSelector('.detail-correct');
  await click(page,'看提示');
  while(await page.$eval('.lesson-hint', b=>b.textContent.includes('看下一步'))) await click(page,'看下一步');
  await click(page,'查看自检');
  assert(await page.$('.self-check'));
  await page.click('.detail-correct');
  await click(page,'白板');
  await click(page,'全屏书写');
  const count=await write764(page);
  const sheet='.ink-workspace .writable path';
  assert.equal((await page.$$(sheet)).length,count);
  await page.click('.ink-workspace [aria-label=撤销]');
  assert.equal((await page.$$(sheet)).length,count-1);
  await page.click('.ink-workspace [aria-label=重做]');
  assert.equal((await page.$$(sheet)).length,count);
  await click(page,'完成');
  await click(page,'停笔美化');
  await page.waitForFunction(()=>document.querySelector('.ink-format-review,.ink-format-error'),{timeout:95000});
  if(await page.$('.ink-format-error')) {
    console.log('首次识别未通过', await page.$eval('.ink-format-error',e=>e.innerText));
    await click(page,'重新排版');
    await page.waitForFunction(()=>document.querySelector('.ink-format-review,.ink-format-error'),{timeout:95000});
  }
  if(await page.$('.ink-format-error')) throw Error(await page.$eval('.ink-format-error',e=>e.innerText));
  await click(page,'校对文字');
  const recognized=await page.$eval('.ink-proof textarea',el=>el.value.trim());
  assert(recognized);
  // Check the actual recognized proposal against the handwritten digits before confirming it.
  if (recognized!=='764') {
    await page.$eval('.ink-proof textarea', e=>{e.focus();e.select();});
    await page.keyboard.sendCharacter('764');
  }
  await click(page,'确认排版稿');
  await click(page,'返回'); await click(page,'继续编辑');
  await click(page,'对照答案');
  await page.waitForSelector('.saved-ink');
  await click(page,'这次做对了');
  await page.waitForSelector('.success');
  await click(page,'再做一道待订正');
  await page.waitForSelector('.answer-input');
  assert(!(await page.$eval('.question-sheet',el=>el.innerText)).includes('9 × 764'));
  await click(page,'已在纸上做完，对照答案');
  await click(page,'还要再练');
  await click(page,'回本题看提示');
  await page.waitForSelector('.hint');
  await page.reload(); await page.waitForSelector('.sheet-row');
  await page.click('.sheet-row::-p-text(764)');
  await page.waitForSelector('.detail-answer details:last-child summary');
  await page.click('.detail-answer details:last-child summary');
  assert.equal((await page.$$('.saved-ink .ink-sheet path')).length,count);
  const row=await page.evaluate(async()=>{const {get}=await import('/src/core/book.ts');return get('public-preview-tsa2024-math-6');});
  assert.equal(row.attempts.at(-1).ink.transcript,'764');
  assert.equal(row.attempts.at(-1).paper,false);
  console.log(JSON.stringify({recognized,confirmed:'764',savedStrokes:count,paper:false,continued:true}));
}
(async()=>{
 const b=await launch({headless:true,executablePath:process.env.CHROME_PATH});
 try {const p=await b.newPage();await p.setViewport({width:393,height:844});await run(p);}
 finally {await b.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
