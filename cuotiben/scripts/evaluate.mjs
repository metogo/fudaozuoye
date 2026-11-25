import { readFile, writeFile } from 'node:fs/promises';
import { generate } from '../server/requesty.js';
import { models } from '../shared/models.js';

const [source, output, modelId] = process.argv.slice(2);
if (!source || !output || !process.env.REQUESTY_API_KEY) throw Error('请指定真实题集、输出位置和服务端密钥。');
const cases = JSON.parse(await readFile(source, 'utf8'));
const evidence = [];
await Promise.all(
  models
    .filter((model) => !modelId || model.id === modelId)
    .map(async (model) => {
      for (const item of cases) {
        const start = Date.now();
        const row = { id: item.id, model: model.id, reference: item.reference };
        try {
          const { lesson, cost } = await generate(
            process.env.REQUESTY_API_KEY,
            { model: model.id, q: item.text, child: '' },
            AbortSignal.timeout(120000),
          );
          Object.assign(row, { lesson, cost, correct: lesson.answer.trim().toUpperCase() === item.reference });
        } catch (error) {
          row.error = error.message;
          row.status = error.status;
        }
        row.ms = Date.now() - start;
        evidence.push(row);
        console.log(
          model.name,
          item.id,
          row.error ? [row.status, row.error].join(' ') : row.correct ? '正确' : '需复核',
        );
        if (
          [401, 402, 403, 429].includes(row.status) ||
          (row.error && evidence.filter((r) => r.model === model.id && r.error).length >= 2)
        )
          break;
      }
    }),
);
await writeFile(output, JSON.stringify(evidence, null, 2));
