import { parseLesson } from '../server/requesty.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { splitMessage, missingInput, questionChoices } from '../src/core/message.js';
import { recognizedSubject, subjectKey, subjectName } from '../shared/subjects.js';
import { corrected, countMistakes, saveQuestion } from '../src/core/book.ts';
test('答错次数从收录时算起，仅再次答错时递增', () => {
  assert.equal(countMistakes(), 1);
  assert.equal(countMistakes([]), 1);
  assert.equal(countMistakes([{ correct: true }]), 1);
  assert.equal(countMistakes([{ correct: false }, { correct: false }, { correct: true }]), 3);
});
test('详情保留阅读材料与选项顺序，只拆分明确的连续四项', async () => {
  const { reviewChoices } = await import('../src/core/review-choices.js');
  const parsed = reviewChoices('请选择\nA. 甲 B. 乙\nC. 丙 D. 丁\n\n材料第一段\n材料第二段');
  assert.deepEqual(parsed, { stem: '请选择', choices: [
    { label: 'A', text: '甲' }, { label: 'B', text: '乙' },
    { label: 'C', text: '丙' }, { label: 'D', text: '丁' },
  ], material: '材料第一段\n材料第二段' });
  assert.equal(reviewChoices('简答题'), null);
  assert.equal(reviewChoices('请选择\nA. 第一项\nC. 第三项'), null);
});
const paper = process.env.SHITI_PUBLIC_CASES;
test('空本、未取得真实讲解及空的解析流不能产生可收录结果', () => {
  assert.equal(corrected({}), false);
  assert.ok(missingInput(''));
  assert.throws(() => saveQuestion({}), /真实模型/);
});
test('学科只用于归档，学段前缀、课程外标签和未分类均可往返显示', () => {
  assert.equal(recognizedSubject('高中数学'), 'math');
  assert.equal(recognizedSubject('立体几何'), 'math');
  assert.equal(recognizedSubject('数学（立体几何）'), 'math');
  assert.equal(recognizedSubject('科学'), 'science');
  const key = recognizedSubject('信息技术（Python 编程）');
  assert.equal(subjectKey(key), key);
  assert.equal(subjectName(key), '信息技术');
  assert.equal(subjectName(recognizedSubject('')), '未分类');
});
test('完整的单步讲解可收录，同段内的明确步骤可单独阅读', () => {
  const result = { hint: '先定位小提琴课的时间标注看看。', answer: 'A', check: '核对课程的开课时间。',
    steps: ['第一步：读出 2 pm - 4 pm。第二步：找出起始时刻。'] };
  assert.equal(parseLesson(result, 'doubao', 'doubao').lesson.steps.length, 2);
  result.steps = ['海报写明课程从 2 pm 开始。'];
  assert.deepEqual(parseLesson(result, 'doubao', 'doubao').lesson.steps, result.steps);
});
for (const name of ['opening', 'collected', 'corrected', 'again']) {
  test(name + ' 动效可编辑、能静态显示且满足传输预算', () => {
    const raw = readFileSync('public/motion/' + name + '.json'),
      anim = JSON.parse(raw);
    assert.ok(anim.layers.length >= 2 && anim.layers.every((l) => l.nm && l.ty === 4));
    if (name === 'opening') {
      const finish = anim.markers.find(marker => marker.cm === '庆祝完成');
      assert.ok(finish.tm / anim.fr <= 3);
      assert.equal(finish.dr / anim.fr, 2);
      assert.equal(finish.tm + finish.dr, anim.op);
    } else assert.ok(anim.op / anim.fr <= 0.65);
    assert.ok(gzipSync(raw).length < 30 * 1024);
    assert.ok(readFileSync('public/motion/' + name + '.svg', 'utf8').includes('<path'));
  });
}
test('公开原卷逐题经过文字入口，保留数字、选项、阅读材料及答案来源', { skip: !paper }, () => {
  const cases = JSON.parse(readFileSync(paper));
  assert.equal(new Set(cases.map((r) => r.subject)).size, 3);
  for (const row of cases) {
    assert.equal(missingInput(row.text), '');
    assert.deepEqual(splitMessage(row.text), { q: row.text });
    const pasted = splitMessage(row.text + '\n参考答案：' + row.reference);
    assert.equal(pasted.q, row.text.trim());
    assert.equal(pasted.teacher, row.reference);
  }
});

test('实卷多题可逐道选取，共用材料及归属不清的答案留在原框核对', { skip: !paper }, () => {
  const [first, second] = JSON.parse(readFileSync(paper)).filter((row) => row.subject === 'math');
  const a = '4. ' + first.text + '\n参考答案：' + first.reference;
  const b = '5. ' + second.text + '\n参考答案：' + second.reference;
  assert.deepEqual(questionChoices(a + '\n' + b), [a, b]);
  assert.equal(splitMessage(questionChoices(a + '\n' + b)[1]).teacher, second.reference);
  assert.deepEqual(questionChoices('4. ' + first.text + '\n' + b), []);
  assert.deepEqual(questionChoices(first.text + '\n' + a + '\n' + b), []);
});

test('公开英语试卷上的价格保留为正文，数学选择题仍能显示公式', { skip: !paper }, async () => {
  const { formulaParts } = await import('../src/core/formulas.js');
  const cases = JSON.parse(readFileSync(paper));
  const eng = cases.find((r) => r.subject === 'eng');
  assert.equal(
    formulaParts(eng.text)
      .map((p) => p.text)
      .join(''),
    eng.text,
  );
  const math = cases.find((r) => r.id === 'math-4').text;
  const mixed = eng.text + '\n$' + math + '$';
  assert.deepEqual(
    formulaParts(mixed)
      .filter((p) => p.formula)
      .map((p) => p.formula),
    [math],
  );
});

test('真实中文提示在 UTF-8、CRLF 和 JSON 转义边界处分块后仍逐字保真', async () => {
  const { readSSE } = await import('../shared/sse.js');
  const { lessonPreview } = await import('../src/core/lessonPreview.js');
  const hints = JSON.parse(readFileSync('docs/qa/真题首条提示.json', 'utf8'));
  const source = hints[0].hint;
  const raw = JSON.stringify({ hint: source }).replace(/[\u4e00-\u9fff]/gu, c =>
    '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  for (let pos = 1; pos <= raw.length; pos++)
    assert(source.startsWith(lessonPreview(raw.slice(0, pos)).hint));
  assert.equal(lessonPreview(raw).hint, source);
  const bytes = new TextEncoder().encode('event: delta\r\ndata: ' + JSON.stringify({ text: source }) + '\r\n\r\n');
  const parts = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const received = [];
  for await (const frame of readSSE(new Response(parts, { headers: { 'Content-Type': 'text/event-stream' } })))
    received.push([frame.event, JSON.parse(frame.data).text]);
  assert.deepEqual(received, [['delta', source]]);
});

test('停笔整理拉直轻微抖动；原笔迹、点、直角和折返都保留', async () => {
  const { inkPath } = await import('../src/core/ink.js');
  const { arrangedPath } = await import('../src/core/arrange-ink.js');
  const jitter = [[0, 4], [14, 5], [30, 3], [45, 4.5], [60, 4]];
  assert.equal(arrangedPath(jitter), 'M0 4 L60 4');
  assert.equal(inkPath(jitter), 'M0 4 L14 5 L30 3 L45 4.5 L60 4');
  assert.equal(arrangedPath([[4, 8]]), 'M4 8h0.01');
  assert.equal(arrangedPath([[4, 8], [4, 3], [10, 3]]), 'M4 8 L4 3 L10 3');
  assert.equal(arrangedPath([[0, 0], [5, 3], [0, 0]]), 'M0 0 L5 3 L0 0');
});

test('全屏下半页及右侧笔迹纳入预览和识别的同一页坐标', async () => {
  const { inkBounds } = await import('../src/core/ink.js');
  assert.deepEqual(inkBounds([]), { width: 600, height: 396 });
  assert.deepEqual(inkBounds([[[80, 240], [70, 1050]], [[1010, 20]]]), { width: 1010, height: 1050 });
});

test('本机算式预览保留写错的答案，复合布局和不完整算式交给完整识别', async () => {
  const { arithmeticPreview } = await import('../src/core/arithmetic-preview.js');
  const one = [[10, 22], [16, 16], [16, 42]];
  const shift = (points, x, y = 0) => points.map(([a,b]) => [a+x,b+y]);
  const plus = [[[23, 29], [37, 29]], [[30, 22], [30, 36]]];
  const equals = [[[61, 26], [76, 26]], [[61, 32], [76, 32]]];
  const prefix = [one, ...plus, shift(one, 34), ...equals];
  assert.equal(arithmeticPreview([...prefix, shift(one, 72)]), '$1+1=1$');
  assert.equal(arithmeticPreview(prefix), '');
  assert.equal(arithmeticPreview([...prefix, shift(one, 72, 60)]), '');
  assert.equal(arithmeticPreview([...prefix, [[90,29]]]), '');
});

test('阅读材料按自然段换行，原卷栏外行号与书写提示从正文剥离', async () => {
  const { reviewChoices, readingParagraphs } = await import('../src/core/review-choices.js');
  const examples = JSON.parse(readFileSync('scripts/preview/public-lessons.json', 'utf8'));
  const text = examples.find(q => q.id === 'public-preview-tsa2024-chi-6').q;
  const { material, choices } = reviewChoices(text);
  const paragraphs = readingParagraphs(material);
  assert.equal(choices.length, 4);
  assert.equal(paragraphs.length, 5);
  assert.match(paragraphs[1], /麻雀三姊妹/);
  assert.match(paragraphs[2], /準確。演出的日子/);
  assert.doesNotMatch(paragraphs.join(''), /請勿在此書寫|\d|\n/);
  assert.deepEqual(readingParagraphs('价格 5\n数量 10\n\n合计 50'), ['价格 5\n数量 10', '合计 50']);
});
