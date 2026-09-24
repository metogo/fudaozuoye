// Isolated browser acceptance: real static UI + real quota handler, no cloud writes/model calls.
// Build with NEXT_PUBLIC_API_BASE_URL=/api, then run this script and visit localhost:3035.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

process.env.SESSION_STATE_SECRET = "isolated-browser-acceptance-only";
process.env.AI_MOCK_MODE = "true";
process.env.PUBLIC_APP_ORIGIN = "http://localhost:3035";
process.env.CLOUDBASE_ENV_ID = "";
process.env.CLOUDBASE_APIKEY = "";
const require = createRequire(import.meta.url);
const statistics = require("../functions/learning-api/dist/lib/learning/question-statistics.js");
const { quotaDay, questionHash } = require("../functions/learning-api/dist/lib/learning/question-quota.js");
const { postConsent } = require("../functions/learning-api/dist/lib/learning/http/consent.js");
const { postQuestionAdmission } = require("../functions/learning-api/dist/lib/learning/http/question-entry.js");
const entries = Array.from({ length: 30 }, (_, i) => ({ id: randomUUID(), inputHash: questionHash(`synthetic-${i}`) }));
statistics.statisticsDatabase = () => ({ runTransaction: work => work({ collection: () => ({ doc: () => ({
  get: async () => ({ data: { list: [{ metric: "daily_question_entries", day: quotaDay(), entries }] } }),
  update: async () => { throw new Error("Acceptance must not write"); },
  set: async () => { throw new Error("Acceptance must not write"); },
}) }) }) });
const root = resolve("out");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, "http://localhost:3035");
    if (url.pathname.startsWith("/api/")) {
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(body.length ? { body } : {}) });
      const response = url.pathname === "/api/consent" ? await postConsent(request)
        : url.pathname === "/api/learning/question-entry" ? await postQuestionAdmission(request)
        : new Response("Unexpected API request in quota acceptance", { status: 500 });
      response.headers.forEach((value, key) => outgoing.setHeader(key, value));
      outgoing.statusCode = response.status; outgoing.end(Buffer.from(await response.arrayBuffer()));
      console.log(`${incoming.method} ${url.pathname} ${response.status}`); return;
    }
    const file = resolve(root, `.${decodeURIComponent(url.pathname)}${url.pathname.endsWith("/") ? "index.html" : ""}`);
    if (!file.startsWith(`${root}${sep}`)) { outgoing.writeHead(403).end(); return; }
    outgoing.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
    outgoing.end(await readFile(file));
  } catch { outgoing.writeHead(500).end("Preview unavailable"); }
});
server.listen(3035, "127.0.0.1", () => console.log("Quota acceptance: http://localhost:3035 (30 used; isolated database)"));
