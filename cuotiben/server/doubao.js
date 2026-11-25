import { instructions, parseLesson, parseModelObject, readCompletion, ServiceError } from './requesty.js';

const endpoint = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const photoInstructions = [
  '图片是家长选取的作业区域。优先采用人工核对的题干。独立辨认选项中的平行、垂直、包含、相交，符号不清时指出具体位置。',
  '按题面求解。在讲解 JSON 的最后附 question（完整题干、全部选项、可核对的配图条件）、childWork（确能辨认的学生作答或空串）和 teacher（明确标注的参考答案或空串）。每个选项另起一行。不得把手写作答当成题设。',
  '若家长已经提供题干，仅解析所选的那一题。未指定题干且图片含多道独立题，只输出 {"select":true,"question":"完整转写各题，保留题号及对应材料"}。同一道题的多小问可一起解析。'
].join('\n');
const inkInstructions = '逐字转写学生手写作答，保留错误和换行，不解题，不校订。只输出 JSON {"transcript":"原作答"}。如果图形和布局影响意思，改为 {"missing":"这页需要保留手写布局。"}。';

function validateImage(image) {
  if (typeof image !== 'string' || image.length > 3940000) throw new ServiceError(413, '图片太大，请缩小选区。');
  const header = /^data:image\/(png|jpeg|webp);base64,/.exec(image);
  if (!header) throw new ServiceError(400, '请提交 PNG、JPEG 或 WebP 图片。');
  const bytes = Buffer.from(image.slice(header[0].length, header[0].length + 20), 'base64');
  const valid = header[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    header[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
    bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  if (!valid) throw new ServiceError(400, '图片格式与内容不一致。');
}

export function validateDoubaoInput(body) {
  const { q, child, image, task } = body;
  const ink = task === 'ink';
  if (task && !ink || typeof q !== 'string' || q.length > 8000 || typeof child !== 'string' || child.length > 4000 ||
      (!image && (!q.trim() || ink))) throw new ServiceError(400, '请提供题目文字或选区图片。');
  if (image) validateImage(image);
}
export async function generateDoubao(config, body, signal, onDelta, repair = '') {
  const { q, child, image } = body;
  const ink = body.task === 'ink';
  if (!config?.DOUBAO_API_KEY || !config.DOUBAO_MODEL_ID) throw new ServiceError(503, '错题本尚未配置豆包。');
  const prompt = JSON.stringify({ 题目: q, 孩子原作答: child });
  const system = ink ? inkInstructions : [instructions, image ? photoInstructions : ''].join('\n');
  const content = image ? [{ type: 'image_url', image_url: { url: image } }, { type: 'text', text: prompt }] : prompt;
  const model = config.DOUBAO_MODEL_ID;
  const init = {
    method: 'POST', redirect: 'error', signal,
    headers: { Authorization: 'Bearer ' + config.DOUBAO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system + repair }, { role: 'user', content }],
      stream: true, response_format: { type: 'json_object' }, thinking: { type: 'disabled' }, max_tokens: 6000 })
  };
  const response = await connect(init);
  if (!response.ok) throw new ServiceError(response.status === 429 ? 429 : 502, '豆包暂时无法完成这次请求，请重试。');
  const { content: raw, returnedModel } = await readCompletion(response, model, onDelta, model.startsWith('ep-'));
  const result = parseModelObject(raw);
  const source = { provider: 'doubao', modelId: returnedModel };
  if (ink) {
    if (result.missing || !result.transcript?.trim()) throw new ServiceError(422,'请保留原稿，当前手写布局无法完整转为文字。');
    return { lesson: { ...source, transcript: result.transcript.trim() } };
  }
  const question = typeof result.question === 'string' ? result.question.trim() : '';
  if (image && result.select === true && question) return { lesson: { ...source, select: true, question } };
  const parsed = parseLesson(result, 'doubao', returnedModel);
  if (image && !question && !q.trim()) throw new ServiceError(422, '未读出题干，请核对选区或补上文字。');
  if (image) Object.assign(parsed.lesson, { question: question || q, childWork: typeof result.childWork === 'string' ? result.childWork : '',
    teacher: typeof result.teacher === 'string' ? result.teacher : '' });
  return parsed;
}

async function connect(init) {
  try {
    return await fetch(endpoint, init);
  } catch (error) {
    // These failures occur before any HTTP request reaches the model.
    if (init.signal.aborted || !['UND_ERR_CONNECT_TIMEOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'].includes(error.cause?.code)) throw error;
    console.warn('Notebook model connection retry', error.cause.code, process.env.VERCEL_REGION);
    return fetch(endpoint, init);
  }
}
