import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { assertBoardExperience, compileBoardExperience } = require("../functions/learning-api/dist/lib/learning/board-experience.js");
const { isStoredBoardLesson } = require("../functions/learning-api/dist/lib/learning/board-cache.js");
const { compileBoardDocument, createBoardWorkspaceState, isStoredBoardWorkspaceState, restoreBoardWorkspaceState } = require("../functions/learning-api/dist/lib/learning/board-workspace.js");

const apiBase = process.env.REAL_USER_API_BASE_URL ?? "http://localhost:9000/api";
const appOrigin = process.env.REAL_USER_APP_ORIGIN ?? "http://localhost:3000";
const outputDir = resolve(process.env.BOARD_E2E_OUTPUT_DIR ?? "_bmad-output/implementation-artifacts/tests/board-stage-a-e2e");
const concurrency = Math.max(1, Math.min(3, Number(process.env.BOARD_E2E_CONCURRENCY ?? 2)));
const cases = boardCases();
const results = [];
let cursor = 0;

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < cases.length) {
    const item = cases[cursor++];
    const startedAt = Date.now();
    try {
      results.push({ ...await runCase(item), elapsedMs: Date.now() - startedAt, status: "passed" });
      process.stdout.write(`board-e2e ${item.id} ${item.subject} passed\n`);
    } catch (error) {
      results.push({ id: item.id, subject: item.subject, gradeBand: item.gradeBand, elapsedMs: Date.now() - startedAt, status: "failed", failure: message(error) });
      process.stdout.write(`board-e2e ${item.id} ${item.subject} failed ${message(error)}\n`);
    }
  }
}));

results.sort((left, right) => left.id.localeCompare(right.id));
const passed = results.filter((item) => item.status === "passed");
const summary = {
  cases: results.length,
  passed: passed.length,
  failed: results.length - passed.length,
  subjects: [...new Set(passed.map((item) => item.subject))],
  gradeBands: [...new Set(passed.map((item) => item.gradeBand))],
  boardOpenP95Ms: percentile(passed.map((item) => item.boardOpenMs), 0.95),
  semanticVisualCases: passed.filter((item) => item.semanticVisuals.length > 0).length,
  semanticKinds: [...new Set(passed.flatMap((item) => item.semanticVisuals))],
  primaryMediaCases: passed.filter((item) => item.primaryMedia.length > 0).length,
  primaryMediaKinds: [...new Set(passed.flatMap((item) => item.primaryMedia))],
  contextChangedBlueprint: passed.some((item) => item.contextChangedBlueprint),
  boardQuestionPassed: passed.some((item) => item.boardQuestionPassed),
  cacheRestorePassed: passed.every((item) => item.cacheRestorePassed),
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "results.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2)}\n`, "utf8");
await writeFile(resolve(outputDir, "summary.md"), renderSummary(summary, results), "utf8");
process.stdout.write(`BOARD_STAGE_A_E2E ${JSON.stringify(summary)}\n`);

if (summary.failed > 0
  || summary.subjects.length !== 9
  || summary.gradeBands.length !== 3
  || summary.semanticVisualCases < 4
  || !["derivation", "relation", "source"].every((kind) => summary.primaryMediaKinds.includes(kind))
  || !summary.contextChangedBlueprint
  || !summary.boardQuestionPassed
  || !summary.cacheRestorePassed
  || summary.boardOpenP95Ms > 5_000) process.exitCode = 1;

async function runCase(item) {
  const cookie = await consent();
  const analyzed = await analyzeWithRetry(item, cookie);
  const started = await postTurn(analyzed.stateToken, { type: "start" }, cookie);
  const before = latestState(started);
  const gate = before.session.flow.activeGate;
  if (!gate?.options?.some((option) => option.id === "view_board")) throw new Error("当前学习任务没有板书入口");

  const context = [{ id: `${item.id}-blocker`, role: "user", text: item.blocker }];
  const boardStartedAt = Date.now();
  const opened = await postTurn(before.stateToken, { type: "choose", gateId: gate.id, choice: "view_board", boardContext: context }, cookie);
  const boardOpenMs = Date.now() - boardStartedAt;
  const boardEvents = opened.events.filter((event) => event.name === "board.lesson");
  if (boardEvents.length !== 1) throw new Error(`一次打开返回了 ${boardEvents.length} 份板书`);
  if (opened.events.some((event) => event.name === "presentation.unavailable" || event.name === "error")) throw new Error("打开板书返回错误或不可用事件");
  const boardIndex = opened.events.findIndex((event) => event.name === "board.lesson");
  const stateIndex = opened.events.findIndex((event) => event.name === "flow.update");
  if (boardIndex < 0 || stateIndex < 0 || boardIndex > stateIndex) throw new Error("板书没有先于状态收尾事件返回");

  const board = boardEvents[0].data;
  const experience = validateBoard(board, item);
  const after = latestState(opened);
  if (after.session.flow.activeGate?.id !== gate.id || after.session.flow.stage !== before.session.flow.stage) throw new Error("打开板书改变了当前学习任务");

  const document = compileBoardDocument(experience);
  const workspace = createBoardWorkspaceState(document);
  if (!isStoredBoardWorkspaceState(workspace, document)) throw new Error("板书工作区初始状态不可恢复");
  if (!isStoredBoardWorkspaceState(restoreBoardWorkspaceState(document, workspace), document)) throw new Error("板书重开后工作区状态丢失");

  const restored = await restoreBoard(after.stateToken, board, cookie);
  const restoredExperience = validateBoard(restored, item);
  const cacheRestorePassed = restoredExperience.scenes.length >= 2;

  let contextChangedBlueprint = false;
  if (item.id === "B01") {
    const alternate = await postTurn(before.stateToken, {
      type: "choose", gateId: gate.id, choice: "view_board",
      boardContext: [{ id: "B01-derive", role: "user", text: "我知道题意，但卡在推导，不明白为什么要这样变形。" }],
    }, cookie);
    const alternateBoard = alternate.events.find((event) => event.name === "board.lesson")?.data;
    const alternateExperience = validateBoard(alternateBoard, item);
    contextChangedBlueprint = experience.scenes.map((scene) => scene.move).join("|") !== alternateExperience.scenes.map((scene) => scene.move).join("|");
    if (!contextChangedBlueprint) throw new Error("同题不同卡点没有改变板书教学动作");
  }

  let boardQuestionPassed = false;
  if (item.id === "B02") {
    const answer = await postTurn(after.stateToken, { type: "question", text: "板书里的第一步为什么必要？" }, cookie);
    const resumed = latestState(answer);
    boardQuestionPassed = answer.events.some((event) => event.name === "message.delta")
      && answer.events.some((event) => event.name === "flow.resume")
      && resumed.session.flow.activeGate?.id === gate.id;
    if (!boardQuestionPassed) throw new Error("板书问答后没有返回原学习任务");
  }

  return {
    id: item.id, subject: item.subject, gradeBand: item.gradeBand,
    analysisAttempts: analyzed.attempts, boardOpenMs,
    sceneCount: experience.scenes.length,
    moves: experience.scenes.map((scene) => scene.move),
    semanticVisuals: experience.scenes.flatMap((scene) => scene.elements.flatMap((element) => element.type === "visual" ? [element.visual.kind] : [])),
    primaryMedia: experience.scenes.filter((scene) => scene.medium !== "text").map((scene) => scene.medium),
    contextChangedBlueprint, boardQuestionPassed, cacheRestorePassed,
  };
}

function validateBoard(board, item) {
  if (!isStoredBoardLesson(board)) throw new Error("板书未通过持久化协议验收");
  if (board.quality?.status === "safe_fallback") throw new Error(`板书发生整体降级：${board.quality.reason ?? "未知原因"}`);
  if (board.plan?.version !== 2 || board.plan.contentRevision !== 2 || board.plan.discipline !== item.subject) throw new Error("板书没有使用当前学科原生协议");
  const experience = compileBoardExperience(board);
  assertBoardExperience(experience);
  if (experience.scenes.length < 2 || experience.scenes.length > 6) throw new Error("板书场景数不在 2–6 范围内");
  if (new Set(experience.scenes.map((scene) => compact(scene.content))).size !== experience.scenes.length) throw new Error("板书场景正文重复");
  if (experience.scenes.some((scene) => scene.elements.length !== scene.actions.length)) throw new Error("板书揭示动作与内容元素不一致");
  return experience;
}

async function analyzeWithRetry(item, cookie) {
  let lastError;
  for (let attempts = 1; attempts <= 2; attempts += 1) {
    try {
      const form = new FormData();
      form.set("stage", "full");
      form.set("provider", "doubao");
      form.set("reasoningLevel", item.reasoningLevel);
      form.set("problem", JSON.stringify({ text: item.text, childWork: item.childWork, subject: item.subject, gradeBand: item.gradeBand, learnerBand: item.gradeBand, confidence: 1, userRevised: true }));
      const response = await fetch(`${apiBase}/learning/analyze`, { method: "POST", headers: headers(cookie), body: form, signal: AbortSignal.timeout(240_000) });
      return { ...latestState(await readSse(response), "graph"), attempts };
    } catch (error) { lastError = error; }
  }
  throw new Error(`两次分析均失败：${message(lastError)}`);
}

async function postTurn(stateToken, input, cookie) {
  const response = await fetch(`${apiBase}/learning/turn`, {
    method: "POST", headers: { ...headers(cookie), "Content-Type": "application/json" },
    body: JSON.stringify({ stateToken, input }), signal: AbortSignal.timeout(240_000),
  });
  return { events: await readSse(response) };
}

async function restoreBoard(stateToken, lesson, cookie) {
  const response = await fetch(`${apiBase}/learning/board-cache`, {
    method: "POST", headers: { ...headers(cookie), "Content-Type": "application/json" },
    body: JSON.stringify({ stateToken, lesson }), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`板书缓存复检失败：${response.status}`);
  const payload = await response.json();
  if (!payload.data?.lesson) throw new Error(payload.error?.message ?? "板书缓存没有返回内容");
  return payload.data.lesson;
}

async function consent() {
  const response = await fetch(`${apiBase}/consent`, { method: "POST", headers: { Origin: appOrigin }, signal: AbortSignal.timeout(10_000) });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!response.ok || !cookie) throw new Error("监护人告知接口没有返回有效会话");
  return cookie;
}

async function readSse(response) {
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  const events = text.split(/\n\n/).flatMap((block) => {
    const name = block.match(/^event: (.+)$/m)?.[1];
    const raw = block.match(/^data: (.+)$/m)?.[1];
    return name && raw ? [{ name, data: JSON.parse(raw) }] : [];
  });
  const failure = events.find((event) => event.name === "error");
  if (failure) throw new Error(failure.data?.message ?? "SSE 返回错误");
  if (!events.some((event) => event.name === "complete")) throw new Error("SSE 没有完成事件");
  return events;
}

function latestState(input, eventName = "flow.update") {
  const events = Array.isArray(input) ? input : input.events;
  const state = events.findLast((event) => event.name === eventName)?.data;
  if (!state?.session || !state.stateToken) throw new Error(`缺少 ${eventName} 学习状态`);
  return state;
}

function boardCases() {
  return [
    c("B01", "math", "primary", "light", "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", "我只想先确认题目给了哪些已知条件。"),
    c("B02", "math", "junior", "medium", "在三角形ABC中，∠A=90°，AB=3，AC=4，求斜边BC。", "我不会把直角和边长放进同一张图。"),
    c("B03", "math", "senior", "high", "已知函数f(x)=x²-4x+3，说明怎样判断它的对称轴与开口方向。", "我不明白式子和图像特征怎么对应。"),
    c("B04", "math", "senior", "medium", "数列满足aₙ₊₁=2aₙ+1，a₁=1，说明递推关系中每个量的作用。", "我卡在递推式的变形依据。"),
    c("B05", "physics", "junior", "light", "凸透镜焦距10厘米，蜡烛到透镜距离25厘米，判断像的性质。", "我不知道物距和焦距应该怎样比较。"),
    c("B06", "physics", "senior", "medium", "质量2千克的物体受到10牛合力，说明怎样建立受力与加速度的关系。", "我不知道公式里的量怎样对应题目。"),
    c("B07", "chemistry", "junior", "light", "比较化合反应与分解反应在反应物、生成物数量上的区别。", "我总把两类反应混淆。"),
    c("B08", "chemistry", "senior", "high", "铁元素化合价从0升到+3，说明怎样判断氧化与还原。", "我不懂化合价变化与结论的关系。"),
    c("B09", "biology", "junior", "light", "植物的根、茎、叶分别有什么作用？请按结构和功能整理。", "我记不清结构和功能怎样对应。"),
    c("B10", "biology", "junior", "medium", "探究光照是否影响植物生长，应怎样设置对照实验？", "我不会判断变量和不变量。"),
    c("B11", "chinese", "primary", "light", "阅读句子：小河唱着歌跑向远方。说说这句话怎样写出小河的特点。", "我找不到需要引用的原句。"),
    c("B12", "chinese", "junior", "medium", "阅读：风把树叶一页页翻过，月光在地上写下安静的句子。赏析两处表达。", "我分不清原文证据和自己的解释。"),
    c("B13", "english", "primary", "light", "Read: Tom gets up at seven and walks to school. What does Tom do before school?", "I cannot find the exact evidence in the sentence."),
    c("B14", "english", "junior", "medium", "Read: Lucy planned to walk home. The rain became heavier, so she took the bus. Why did Lucy change her plan?", "I do not know how the evidence supports the answer."),
    c("B15", "history", "junior", "light", "材料：唐朝前期农业发展，手工业兴盛，商业往来频繁。概括当时经济发展的表现。", "我不会从材料里分类找证据。"),
    c("B16", "history", "junior", "medium", "1840年鸦片战争爆发；1842年《南京条约》签订；1895年《马关条约》签订。按时间整理材料。", "我看不清事件的先后顺序。"),
    c("B17", "geography", "junior", "light", "比较平原与山地在地势起伏和交通条件上的差异。", "我不知道应该按什么维度比较。"),
    c("B18", "geography", "junior", "medium", "某地夏季高温多雨、冬季寒冷干燥，分析影响其气候的主要因素。", "我不明白地理要素怎样连接成过程。"),
    c("B19", "politics", "junior", "light", "材料：学校无故拒绝学生入学，学生依法申诉并恢复入学。说明材料体现的观点。", "我不知道材料中的行为怎样支撑观点。"),
    c("B20", "politics", "senior", "medium", "比较市场调节与政府宏观调控在资源配置中的作用。", "我容易把两种作用混在一起。"),
  ];
}

function c(id, subject, gradeBand, reasoningLevel, text, blocker) {
  return { id, subject, gradeBand, reasoningLevel, text, blocker, childWork: "" };
}

function compact(value) { return String(value).normalize("NFKC").replace(/\s+/g, "").toLowerCase(); }
function message(error) { return error instanceof Error ? error.message : String(error); }
function headers(cookie) { return { Origin: appOrigin, Cookie: cookie }; }
function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function renderSummary(summary, items) {
  const failures = items.filter((item) => item.status === "failed");
  return `# 板书阶段 A 端到端验收\n\n日期：${new Date().toISOString()}\n\n## 结果\n\n- 场景：${summary.passed}/${summary.cases} 通过\n- 学科：${summary.subjects.length}/9\n- 学段：${summary.gradeBands.join("、")}\n- 打开板书 P95：${summary.boardOpenP95Ms ?? "无数据"} ms\n- 使用专业图形：${summary.semanticVisualCases}/${summary.passed}\n- 已出现专业图形：${summary.semanticKinds.join("、") || "无"}\n- 主介质覆盖：${summary.primaryMediaCases}/${summary.passed}\n- 已出现主介质：${summary.primaryMediaKinds.join("、") || "无"}\n- 同题不同卡点改变板书：${summary.contextChangedBlueprint ? "通过" : "失败"}\n- 板书问答返回主线：${summary.boardQuestionPassed ? "通过" : "失败"}\n- 缓存重开：${summary.cacheRestorePassed ? "通过" : "失败"}\n\n## 失败\n\n${failures.length ? failures.map((item) => `- ${item.id} ${item.subject}：${item.failure}`).join("\n") : "- 无"}\n`;
}
