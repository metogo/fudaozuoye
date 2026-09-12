export type SseEventHandler = (event: string, data: unknown) => void | Promise<void>;

export async function readSseResponse(response: Response, onEvent: SseEventHandler) {
  if (!response.ok || !response.body) throw new Error(await responseErrorMessage(response));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const parse = async (block: string) => {
    const event = block.match(/^event: ?(.+)$/m)?.[1];
    const raw = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n");
    if (!event || !raw) return;
    if (completed) throw new Error("流式结束后收到重复内容");

    const data = JSON.parse(raw) as unknown;
    if (event === "error") throw new Error(String((data as { message?: string }).message ?? "流式请求失败"));
    if (event === "complete") completed = true;
    await onEvent(event, data);
  };

  try {
    while (!completed) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // Normalize after joining chunks, since CR and LF can arrive separately.
      buffer = buffer.replace(/\r\n/g, "\n");
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) await parse(block);
      if (done) { if (buffer.trim()) await parse(buffer); break; }
    }
    if (!completed) throw new Error("流式连接意外中断，请重试当前操作");
  } finally {
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}

async function responseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as { error?: { message?: string } };
    return payload.error?.message?.trim() || "流式请求失败";
  } catch {
    return text || "流式请求失败";
  }
}
