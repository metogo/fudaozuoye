// Run against the local H5 and live notebook service with SHITI_QUESTION_PNG set to a public question.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { launch } = require(process.env.PUPPETEER_MODULE || 'puppeteer');

async function main() {
  const original = 'data:image/png;base64,' + readFileSync(process.env.SHITI_QUESTION_PNG).toString('base64');
  const browser = await launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.SHITI_ORIGIN || 'http://localhost:43872');
    const live = await page.evaluate(async image => {
      const { generateLesson } = await import('/src/core/learning.js');
      let updates = 0;
      const id = crypto.randomUUID();
      const lesson = await generateLesson({ model: 'doubao', img: image, q: '', child: '' }, { id },
        new AbortController().signal, () => {}, preview => { if (preview.hint || preview.detail) updates++; });
      return { id, lesson, updates };
    }, original);
    assert.equal(live.lesson.provider, 'doubao');
    assert(live.lesson.steps.length >= 2 && live.updates > 1);
    const q = live.lesson.question;
    // Exercise the exact server parser with real inference and only the optional tag removed.
    delete live.lesson.subject;
    const { parseLesson } = await import('../server/requesty.js');
    const { lesson } = parseLesson(live.lesson, 'doubao', live.lesson.modelId);
    assert.equal(lesson.subject, 'unknown');
    await page.evaluate(async ({ id, q, lesson, original }) => {
      const { saveQuestion } = await import('/src/core/book.ts');
      await saveQuestion({ id, date: Date.now(), q, child: '', teacher: '', source: '照片', img: original,
        subject: lesson.subject, lesson, attempts: [] });
    }, { id: live.id, q, lesson, original });
    await page.reload();
    await page.waitForSelector('.subject-filter');
    await page.select('.subject-filter', 'unknown');
    await page.click('.sheet-row');
    await page.waitForSelector('.detail-subject');
    assert.equal(await page.$eval('.detail-subject', el => el.textContent), '未分类');
    console.log('无学科和学段的真实题目已完成流式解析、收录、刷新、筛选与详情回读。');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
