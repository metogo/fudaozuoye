import { notebookOrigins } from '../../shared/notebook-origins.js';
import { notebookApi } from './host.js';
import { readSSE } from '../../shared/sse.js';
import { lessonPreview } from './lessonPreview.js';

function browserId() {
  const key = 'notebook-device-v1';
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}

async function request(body, entryId, signal, publish) {
  const deviceId = navigator.locks ? await navigator.locks.request('notebook-device', browserId) : browserId();
  const direct = body.model === 'doubao' && notebookOrigins.has(location.origin);
  const url = direct ? import.meta.env.VITE_NOTEBOOK_DOUBAO_URL : notebookApi;
  if (!url) throw Error('此版本缺少错题本解析服务地址。');
  const response = await fetch(url, {
    method: 'POST', credentials: direct ? 'omit' : 'same-origin', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', Accept: publish ? 'text/event-stream' : 'application/json' },
    body: JSON.stringify({ ...body, deviceId, entryId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw Error(error?.message || '模型暂时无法响应，原稿已保留。');
  }
  if (!publish) return response.json();
  let raw = '';
  for await (const { event, data } of readSSE(response)) {
    const payload = JSON.parse(data);
    if (event === 'error') throw Error(payload.message || '解析未完成。');
    if (event === 'complete') {
      const provider = body.model === 'doubao' ? 'doubao' : 'requesty';
      if (payload.provider !== provider || !payload.modelId || (provider === 'requesty' && payload.modelId !== body.model))
        throw Error('返回模型与所选模型不符。');
      return payload;
    }
    if (event === 'reset') { raw = ''; publish({ hint: '', detail: '' }); }
    if (event === 'delta' && typeof payload.text === 'string') {
      raw += payload.text;
      publish(lessonPreview(raw));
    }
  }
  throw Error('解析流未完整结束，原稿已保留。');
}

export function generateLesson(draft, submission, signal, progress, publish) {
  progress('正在解析题目…');
  const model = draft.model || 'doubao';
  return request({ model, q: draft.q.trim(), child: draft.child.trim(),
    ...(model === 'doubao' && draft.img ? { image: draft.img } : {}) }, submission.id, signal, publish);
}

export async function recognizeInk(blob, entryId, signal) {
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const result = await request({ model: 'doubao', task: 'ink', q: '', child: '', image }, entryId, signal);
  if (!result.transcript?.trim()) throw Error('未读出完整作答，可继续使用原稿。');
  return result.transcript;
}
