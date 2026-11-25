// Decode transport chunks before looking for SSE frame boundaries. A UTF-8 character
// or a CRLF pair can span two reads. Incomplete events are never dispatched.
export async function* readSSE(response) {
  if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream'))
    throw Error('服务未返回 SSE 数据流。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', ended = false;
  try {
    while (!ended) {
      const { value, done } = await reader.read();
      ended = done;
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop();
      if (buffer.length > 256000) throw Error('模型数据帧过长。');
      for (const frame of frames) {
        const lines = frame.split(/\r?\n/);
        const fields = lines.filter(line => line.startsWith('data:'));
        if (fields.length) yield {
          event: lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message',
          data: fields.map(line => line.slice(5).replace(/^ /, '')).join('\n'),
        };
      }
    }
  } finally {
    try { if (!ended) await reader.cancel(); } finally { reader.releaseLock(); }
  }
}
