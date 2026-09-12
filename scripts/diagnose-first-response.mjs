// Live local browser diagnostic; statistics are isolated, no production settings change.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const label = process.argv.includes('--priority') ? '-priority' : '';
const typed = process.argv.includes('--text');
try {
  const modes = process.argv.includes('--pair') ? [false, true] : [true, false, false, true];
  for (const [index, map] of modes.entries()) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const calls = [], errors = [];
    let started = 0;
    await page.route('**/statistics', route => route.fulfill({ json: { total: 10000, counted: true } }));
    if (!map) await page.route('**/learning/knowledge-map', route => route.abort());
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/') && started) calls.push({ path, startMs: Date.now() - started });
    });
    await page.addInitScript(() => {
      const original = window.fetch;
      window.diagnosticEvents = [];
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (!/\/learning\/(analyze|turn)$/.test(response.url)) return response;
        const reader = response.clone().body.getReader(), decoder = new TextDecoder();
        void (async () => {
          let buffer = '', first = true;
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const blocks = buffer.split('\n\n'); buffer = blocks.pop();
              for (const block of blocks) {
                const event = block.match(/^event: (.+)/m)?.[1];
                if (!['perf.phase', 'error', 'recognized', 'message.delta'].includes(event)) continue;
                const data = JSON.parse(block.match(/^data: (.+)/m)?.[1] ?? '{}');
                if (event === 'message.delta') {
                  if (!first || !data.text?.replace(/^### [^\n]*\n\n/, '').trim()) continue;
                  first = false;
                }
                window.diagnosticEvents.push({ event, at: Date.now(), data: event === 'recognized' ? { related: data.visualContext?.related, text: data.text, childWork: data.childWork, missing: data.missingVisualInformation } : event === 'message.delta' ? {} : data });
              }
            }
          } catch (error) { window.diagnosticEvents.push({ event: 'capture_error', message: error.message }); }
        })();
        return response;
      };
    });
    try {
      await page.goto('http://localhost:3000/');
      await page.getByLabel('从相册选择题目').waitFor();
      if (typed) await page.getByRole('textbox').fill('甲、乙两个修路队合修一条长360米的公路。两队同时从两端相向铺设，6天后恰好完工。甲队每天比乙队多修10米。甲、乙两队每天各修多少米？');
      else await page.locator('input[type="file"]').first().setInputFiles('tests/fixtures/synthetic-homework.png');
      const submit = page.getByRole('button', { name: typed ? '发送' : '裁剪并识别', exact: true });
      await submit.waitFor();
      started = Date.now();
      await submit.click();
      await page.waitForFunction(() => [...document.querySelectorAll('.copyable-learning-text__prose')]
        .some(el => el.textContent.replace(/^\s*关键线索\s*/, '').trim().length > 30), undefined, { timeout: 90000 });
      const firstBodyMs = Date.now() - started;
      if (label) {
        if (calls.some(call => call.path.endsWith('/knowledge-map'))) throw new Error('图谱抢在首段完成前请求');
        await mkdir('outputs/first-response-diagnosis', { recursive: true });
        await page.screenshot({ path: `outputs/first-response-diagnosis/priority-${typed ? 'text' : 'photo'}-${index}-first.png` });
      }
      await page.getByRole('button', { name: '看完整讲解', exact: true }).waitFor({ timeout: 90000 });
      const readyMs = Date.now() - started;
      if (label && map) {
        await page.getByText('已全部生成', { exact: true }).waitFor({ timeout: 90000 });
        const ordered = await page.evaluate(() => Boolean(document.querySelector('.conversation-knowledge-map')?.compareDocumentPosition(document.querySelector('.chat-message-entry--assistant')) & Node.DOCUMENT_POSITION_FOLLOWING));
        if (!ordered) throw new Error('图谱未保留在首讲上方的原位置');
        await page.getByRole('button', { name: '展开本题知识图谱', exact: true }).click();
        await page.getByRole('button', { name: '返回对话', exact: true }).click();
        await page.screenshot({ path: `outputs/first-response-diagnosis/priority-${typed ? 'text' : 'photo'}-${index}-ready.png`, fullPage: true });
      }
      const events = (await page.evaluate(() => window.diagnosticEvents)).map(event => ({ ...event, at: event.at - started }));
      const problem = events.find(event => event.event === 'recognized')?.data;
      const values = typed ? ['360', '6', '10'] : ['180', '3', '5'];
      if (!values.every(value => problem?.text?.includes(value)) || (!typed && !problem?.childWork?.includes('108'))) throw new Error('识别遗漏原题条件或已有作答');
      results.push({ index, map, typed, firstBodyMs, readyMs, calls, events, errors });
    } catch (error) { results.push({ index, map, error: error.message, calls, errors }); process.exitCode = 1; }
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
} finally {
  await browser.close();
  await mkdir('outputs/first-response-diagnosis', { recursive: true });
  await writeFile(`outputs/first-response-diagnosis/browser${label}${typed ? '-text' : ''}${process.argv.includes('--pair') ? '-pair' : ''}.json`, JSON.stringify(results, null, 2));
}
