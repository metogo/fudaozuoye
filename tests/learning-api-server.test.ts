import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main } from "@/functions/learning-api/src/index";
let base = "";
beforeAll(async () => { process.env.PUBLIC_APP_ORIGIN = "https://app.example"; await new Promise<void>(resolve => main.listen(0, "127.0.0.1", () => resolve())); const address = main.address(); base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`; });
afterAll(async () => { delete process.env.PUBLIC_APP_ORIGIN; await new Promise<void>(resolve => main.close(() => resolve())); });
describe("learning-api HTTP server", () => {
 it("规范化 /api 路径、透传路由响应并加入受限 CORS", async () => { const reply = await fetch(`${base}/api/consent/`, { method: "POST", headers: { origin: "https://app.example" } }); expect(reply.status).toBe(200); expect(reply.headers.get("content-type")).toMatch(/application\/json/); expect(reply.headers.get("access-control-allow-origin")).toBe("https://app.example"); });
 it("支持预检、未知路由和过大请求的安全错误", async () => { const preflight = await fetch(`${base}/api/learning/turn`, { method: "OPTIONS", headers: { origin: "https://app.example" } }); expect(preflight.status).toBe(204); const missing = await fetch(`${base}/api/missing`, { method: "POST" }); expect(missing.status).toBe(404); const huge = await fetch(`${base}/api/consent`, { method: "POST", body: "x".repeat(8 * 1024 * 1024 + 1) }); expect(huge.status).toBe(413); });
});
