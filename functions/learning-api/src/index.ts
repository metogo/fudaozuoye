import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { postAnalyze } from "../../../lib/learning/http/analyze";
import { postBoardCache } from "../../../lib/learning/http/board-cache";
import { postConsent } from "../../../lib/learning/http/consent";
import { postExpand } from "../../../lib/learning/http/expand";
import { getProviders } from "../../../lib/learning/http/providers";
import { postSolution } from "../../../lib/learning/http/solution";
import { postSimilarCheck } from "../../../lib/learning/http/similar";
import { postTransfer } from "../../../lib/learning/http/transfer";
import { postTutor } from "../../../lib/learning/http/tutor";
import { postTurn } from "../../../lib/learning/http/turn";
import { postVerify } from "../../../lib/learning/http/verify";

const maximumRequestBytes = 8 * 1024 * 1024;

const routes: Record<string, (request: Request) => Promise<Response> | Response> = {
  "POST /consent": postConsent,
  "GET /providers": getProviders,
  "POST /learning/analyze": postAnalyze,
  "POST /learning/board-cache": postBoardCache,
  "POST /learning/expand": postExpand,
  "POST /learning/verify": postVerify,
  "POST /learning/transfer": postTransfer,
  "POST /learning/solution": postSolution,
  "POST /learning/similar": postSimilarCheck,
  "POST /learning/tutor": postTutor,
  "POST /learning/turn": postTurn,
};

export const main = createServer((request, response) => {
  void handle(request, response);
});

if (require.main === module) main.listen(Number(process.env.PORT ?? 9000), process.env.HOST?.trim() || "0.0.0.0");

async function handle(incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
  const requestAbort = new AbortController();
  incoming.once("aborted", () => requestAbort.abort());
  outgoing.once("close", () => requestAbort.abort());
  try {
    if (incoming.method === "OPTIONS") {
      const response = new Response(null, { status: 204, headers: corsHeaders(incoming) });
      await writeResponse(outgoing, response);
      return;
    }
    const request = await toWebRequest(incoming, requestAbort.signal);
    const path = normalizePath(new URL(request.url).pathname);
    const handler = routes[`${request.method} ${path}`];
    const response = handler ? await handler(request) : new Response("接口不存在", { status: 404 });
    for (const [key, value] of corsHeaders(incoming)) response.headers.set(key, value);
    await writeResponse(outgoing, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务请求失败";
    await writeResponse(outgoing, new Response(message, { status: message.includes("过大") ? 413 : 500 }));
  }
}

function corsHeaders(incoming: IncomingMessage): Headers {
  if (process.env.CORS_MANAGED_BY_GATEWAY === "true") return new Headers();
  const origin = incoming.headers.origin;
  const allowedOrigin = process.env.PUBLIC_APP_ORIGIN?.trim();
  if (!allowedOrigin || origin !== allowedOrigin) return new Headers();
  return new Headers({
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  });
}

function normalizePath(pathname: string): string {
  const path = pathname.replace(/^\/api(?=\/|$)/, "") || "/";
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

async function toWebRequest(incoming: IncomingMessage, signal: AbortSignal): Promise<Request> {
  const body = await readBody(incoming);
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (value) headers.set(name, value.join(", "));
  }
  const origin = process.env.PUBLIC_APP_ORIGIN?.trim() || headers.get("origin") || `${headers.get("x-forwarded-proto") ?? "https"}://${headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost"}`;
  return new Request(new URL(incoming.url ?? "/", origin).toString(), { method: incoming.method, headers, body: body.length ? new Uint8Array(body) : undefined, signal });
}

async function readBody(incoming: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of incoming) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += chunk.length;
    if (size > maximumRequestBytes) throw new Error("请求内容过大");
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

async function writeResponse(outgoing: ServerResponse, response: Response): Promise<void> {
  response.headers.forEach((value, key) => outgoing.setHeader(key, value));
  outgoing.statusCode = response.status;
  if (!response.body) {
    outgoing.end();
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    outgoing.write(Buffer.from(value));
  }
  outgoing.end();
}
