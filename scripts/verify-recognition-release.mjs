import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { apiBase, appOrigin, post, readEvents } from "./verify-knowledge-map-release.mjs";

// Only synthetic fixtures are submitted; never read a user's photo or clipboard.
const fixtures = [
  { name: "text-complete", html: "如图，一个长方形的长是8厘米，宽是3厘米。求这个长方形的周长。", related: false, missing: false },
  { name: "diagram-missing", html: "如图，求阴影部分的面积。（所有尺寸均标在图中，单位：厘米。）", related: false, missing: true },
  { name: "diagram-present", html: `如图，求长方形的周长。<svg width="480" height="240" viewBox="0 0 480 240"><rect x="70" y="65" width="300" height="120" fill="none" stroke="black" stroke-width="3"/><text x="190" y="46" font-size="26">8厘米</text><text x="380" y="135" font-size="26">3厘米</text></svg>`, related: true, missing: false },
];

export async function verifyRecognition() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.route("**/*", route => route.abort());
    // Repeated text-only cases catch probabilistic confusion between OCR text and diagram labels.
    for (const fixture of [...fixtures, fixtures[0], fixtures[0]]) {
      await page.setContent(`<main style="background:white;color:black;padding:32px;width:620px;font:28px/1.8 sans-serif">${fixture.html}</main>`);
      const image = await page.locator("main").screenshot();
      const consent = await fetch(`${apiBase}/consent`, { method: "POST", headers: { Origin: appOrigin }, signal: AbortSignal.timeout(15000) });
      assert.equal(consent.status, 200);
      const cookie = consent.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie);
      const form = new FormData();
      form.set("stage", "recognize"); form.set("provider", "doubao"); form.set("reasoningLevel", "light");
      form.set("image", new File([image], `${fixture.name}.png`, { type: "image/png" }));
      const events = await readEvents(await post("/learning/analyze", cookie, form));
      const problem = events.find(e => e.name === "recognized")?.data;
      assert.ok(problem?.text?.trim(), `${fixture.name}: 没有完整识别结果`);
      assert.equal(events.find(e => e.name === "complete")?.data.mode, "live");
      assert.equal(problem.visualContext?.related, fixture.related, `${fixture.name}: 配图归属错误 ${JSON.stringify(problem.visualContext)}`);
      assert.equal(Boolean(problem.missingVisualInformation?.length), fixture.missing, `${fixture.name}: 必要条件完整性错误`);
      if (fixture.related) assert.ok(problem.visualContext.facts.length > 0, "配图证据不得为空");
      else assert.deepEqual(problem.visualContext.facts, [], "纯文字照片不得生成图形证据");
      const full = new FormData();
      full.set("stage", "full"); full.set("provider", "doubao"); full.set("reasoningLevel", "light");
      full.set("problem", JSON.stringify(problem));
      const response = await post("/learning/analyze", cookie, full);
      if (fixture.missing) {
        assert.equal(response.status, 400, "缺图题不得开始讲解");
        assert.match(await response.text(), /补拍题目和配图/);
      } else {
        const prepared = await readEvents(response);
        const state = prepared.find(e => e.name === "graph")?.data;
        assert.ok(state?.stateToken, "完整题目未进入学习流程");
        let turnBody = { stateToken: state.stateToken, input: { type: "start" } };
        if (fixture.related) {
          const multipart = new FormData();
          multipart.set("stateToken", state.stateToken); multipart.set("input", JSON.stringify(turnBody.input));
          multipart.set("image", new File([image], "question.png", { type: "image/png" }));
          turnBody = multipart;
        }
        const turn = await readEvents(await post("/learning/turn", cookie, turnBody));
        assert.ok(turn.some(e => e.name === "flow.ready"), "首轮讲解未完成");
        assert.ok(turn.some(e => e.name === "message.delta" && e.data.text?.trim()), "首轮讲解没有正文");
      }
      console.log(JSON.stringify({ check: "live-recognition", fixture: fixture.name, passed: true,
        related: problem.visualContext.related, missing: problem.missingVisualInformation ?? [] }));
    }
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyRecognition().catch(error => { console.error(error.message); process.exitCode = 1; });
}
