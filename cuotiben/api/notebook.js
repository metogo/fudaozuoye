import { countRequest } from '../server/quota.js';
import { generateDoubao, validateDoubaoInput } from '../server/doubao.js';
import { once } from 'node:events';
import { generate, LessonFormatError, ServiceError, validateInput } from '../server/requesty.js';
import { models } from '../shared/models.js';

async function readInput(req) {
  if (!String(req.headers['content-type']).startsWith('application/json'))
    throw new ServiceError(415, '请使用网页提交题目。');
  let raw = req.body;
  if (raw === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4000000) throw new ServiceError(413, '题目或图片超出大小限制。');
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString();
  }
  if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw)) > 4000000)
    throw new ServiceError(413, '题目或图片超出大小限制。');
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ServiceError(400, '题目提交格式有误。');
  }
}
function frame(event, value) {
  return 'event: ' + event + '\ndata: ' + JSON.stringify(value) + '\n\n';
}
export function notebookHandler(key, timeoutMs = 120000, config = process.env, allowedOrigins) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const send = (status, data) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    if (req.method === 'GET') return send(200, { models: key ? models : [] });
    if (req.method !== 'POST') return send(405, { message: '请求方式不受支持。' });
    let stage = 'input';
    const origin = req.headers.origin;
    try {
      const trusted = allowedOrigins ? allowedOrigins.has(origin) : ['http://' + req.headers.host, 'https://' + req.headers.host].includes(origin);
      if (!origin || !trusted)
        throw new ServiceError(403, '请从当前网页发起解析。');
      const body = await readInput(req);
      if (body?.model === 'doubao') validateDoubaoInput(body);
      else validateInput(body);
      const controller = new AbortController();
      const abort = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.once('close', abort);
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
        if (body.model === 'doubao' ? !config.DOUBAO_API_KEY || !config.DOUBAO_MODEL_ID : !key)
          throw new ServiceError(503, '当前环境尚未配置所选模型。');
        stage = 'quota';
        await countRequest(config, body);
        signal.throwIfAborted();
        if (res.destroyed) return;
        const streaming = req.headers.accept?.includes('text/event-stream');
        function startStream() {
          if (res.headersSent) return;
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-transform');
          res.setHeader('X-Accel-Buffering', 'no');
          res.flushHeaders();
        }
        const onDelta = streaming ? async (text) => {
          signal.throwIfAborted();
          startStream();
          if (!res.write(frame('delta', { text }))) await once(res, 'drain', { signal });
        } : undefined;
        stage = body.model === 'doubao' ? 'doubao' : 'requesty';
        const run = repair => body.model === 'doubao' ? generateDoubao(config, body, signal, onDelta, repair) : generate(key, body, signal, onDelta, repair);
        let result;
        try {
          result = await run('');
        } catch (error) {
          if (!(error instanceof LessonFormatError)) throw error;
          signal.throwIfAborted();
          if (streaming && res.headersSent) res.write(frame('reset', {}));
          result = await run('\n上一次输出需要补全讲解结构。按原题核对，保留正确内容，只输出完整 JSON。hint、answer、check 各为一段非空文字，steps 为一个非空字符串数组。上一版内容如下：\n' + error.previous);
        }
        const { lesson } = result;
        if (res.destroyed) return;
        if (streaming) {
          startStream();
          res.end(frame('complete', lesson));
        } else send(200, lesson);
      } finally {
        res.off('close', abort);
      }
    } catch (error) {
      if (res.destroyed) return;
      if (!(error instanceof ServiceError)) {
        console.error('Notebook request failed', { stage, type: error.name, code: error.code,
          cause: error.cause?.code, region: process.env.VERCEL_REGION });
      }
      const message = error instanceof ServiceError ? error.message : '模型连接中断或超时，原稿已保留。';
      if (res.headersSent) res.end(frame('error', { message }));
      else send(error.status || 502, { message });
    }
  };
}
export default function handler(req, res) {
  return notebookHandler(process.env.REQUESTY_API_KEY, 115000)(req, res);
}
