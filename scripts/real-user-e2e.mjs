import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderSummary } from "./real-user-e2e-report.mjs";

const require = createRequire(import.meta.url);
const { openSession } = require("../functions/learning-api/dist/lib/learning/server-state.js");
const { deterministicAnswerMatch } = require("../functions/learning-api/dist/lib/learning/providers/assessment.js");
const { isDetailedSolution } = require("../functions/learning-api/dist/lib/learning/solution-quality.js");

const apiBase = process.env.REAL_USER_API_BASE_URL ?? "http://localhost:9000/api";
const appOrigin = process.env.REAL_USER_APP_ORIGIN ?? "http://localhost:3000";
const outputDir = resolve(process.env.REAL_USER_OUTPUT_DIR ?? "outputs/real-user-e2e");
const concurrency = Math.max(1, Math.min(3, Number(process.env.REAL_USER_CONCURRENCY ?? 2)));
const users = createUsers().slice(0, Math.max(1, Math.min(20, Number(process.env.REAL_USER_MAX_USERS ?? 20))));
const cases = createCases();
const routes = ["guided", "remediation", "free_question", "suggestion", "image_question", "image_answer", "board", "wrong_recovery", "full_solution", "solution_board"];
const journeysPerUser = 6;
const imageFixture = await readFile(resolve("tests/fixtures/synthetic-homework.png"));
const routeFilter = process.env.REAL_USER_ROUTE_FILTER || "";
const problemFilter = process.env.REAL_USER_PROBLEM_FILTER || "";
const reasoningOverride = ["light", "medium", "high"].includes(process.env.REAL_USER_REASONING_LEVEL) ? process.env.REAL_USER_REASONING_LEVEL : "";
const fullSolutionOnly = process.env.REAL_USER_FULL_SOLUTION_ONLY === "true";
const results = [];
let cursor = 0;

await mkdir(outputDir, { recursive: true });

await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
  while (true) {
    const userIndex = cursor++;
    if (userIndex >= users.length) return;
    const user = users[userIndex];
    const cookie = await consent();
    for (let caseIndex = 0; caseIndex < journeysPerUser; caseIndex += 1) {
      const problem = cases[(userIndex * journeysPerUser + caseIndex) % cases.length];
      const level = reasoningOverride || ["light", "medium", "high"][(userIndex + caseIndex) % 3];
      const route = routes[(userIndex + caseIndex) % routes.length];
      if (routeFilter && route !== routeFilter) continue;
      if (problemFilter && problem.id !== problemFilter) continue;
      const startedAt = Date.now();
      try {
        const result = await runJourney({ user, problem, level, route, cookie });
        results.push({ ...result, elapsedMs: Date.now() - startedAt });
        process.stdout.write(`journey ${results.length}/${users.length * journeysPerUser} worker=${worker + 1} ${user.id} ${problem.id} ${level} ${route} ${result.status}\n`);
      } catch (error) {
        results.push({ userId: user.id, problemId: problem.id, subject: problem.subject, gradeBand: problem.gradeBand, difficulty: problem.difficulty, level, route, status: "failed", failure: message(error), elapsedMs: Date.now() - startedAt });
        process.stdout.write(`journey ${results.length}/${users.length * 6} worker=${worker + 1} ${user.id} ${problem.id} failed ${message(error)}\n`);
      }
    }
  }
}));

results.sort((a, b) => a.userId.localeCompare(b.userId) || a.problemId.localeCompare(b.problemId));
const summary = buildSummary(results);
await writeFile(resolve(outputDir, "results.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), users, summary, results }, null, 2)}\n`, "utf8");
await writeFile(resolve(outputDir, "summary.md"), renderSummary(summary, results), "utf8");
process.stdout.write(`REAL_USER_E2E_SUMMARY ${JSON.stringify(summary)}\n`);
if (fullSolutionOnly ? (
  summary.functionalCompletionRate < 0.95
  || summary.analysisSuccessRate < 0.95
  || summary.detailedFullSolutions < summary.fullSolutionJourneys
  || summary.fullSolutionStreamRestarts > 0
  || summary.printerLikeSseRate < 1
) : (
  summary.functionalCompletionRate < 0.95
  || summary.analysisSuccessRate < 0.95
  || Object.values(summary.subjectCompletionRates).some((rate) => rate < 0.9)
  || summary.answerAlignmentReviewFlags > 0
  || summary.earlyAnswerLeakCount > 0
  || (summary.boardOffered > 0 && summary.boardValidated / summary.boardOffered < 0.95)
  || (summary.transferRequested > 0 && summary.transferCompleted / summary.transferRequested < 0.8)
  || (summary.wrongRecoveryJourneys > 0 && summary.wrongAnswerFeedback < summary.wrongRecoveryJourneys)
  || (summary.fullSolutionJourneys > 0 && summary.recallRejectedFinalAnswer < summary.fullSolutionJourneys)
  || (summary.fullSolutionJourneys > 0 && summary.detailedFullSolutions < summary.fullSolutionJourneys)
  || (summary.fullSolutionJourneys > 0 && summary.alignedFullSolutions < summary.fullSolutionJourneys)
  || summary.fullSolutionStreamRestarts > 0
  || summary.structuredTutorOutputs < summary.tutorOutputs
  || (summary.fullSolutionJourneys >= 3 && Object.values(summary.postSolutionPaths).some((count) => count < 1))
  || summary.reviewedResume < summary.postSolutionPaths.finish_review
  || summary.suggestionsChosen < summary.suggestionsOffered
  || (summary.suggestionJourneys >= 4 && summary.suggestionsOffered / summary.suggestionJourneys < 0.25)
  || summary.imageQuestionsHandled < summary.imageQuestionJourneys
  || summary.imageAnswersHandled < summary.imageAnswerJourneys
  || summary.solutionBoardsValidated < summary.solutionBoardJourneys
)) process.exitCode = 1;

async function runJourney({ user, problem, level, route, cookie }) {
  const analysis = await analyzeWithRetry(problem, level, cookie);
  let state = analysis.state;
  const observations = {
    analysisAttempts: analysis.attempts,
    sseDeltaCount: 0,
    milestones: 0,
    questionsAsked: 0,
    suggestionGroups: 0,
    suggestionCount: 0,
    gatesHandled: 0,
    boardValidated: false,
    boardOffered: false,
    boardFailure: null,
    boardVisualKind: null,
    remediationObserved: false,
    pathObserved: false,
    wrongAnswerFeedback: false,
    transferCompleted: false,
    transferRequested: false,
    transferUnavailable: false,
    postSolutionChoice: null,
    reviewedResume: false,
    recallRejectedFinalAnswer: false,
    fullSolutionChars: 0,
    fullSolutionPreview: "",
    fullSolutionStructured: false,
    fullSolutionAnswerAligned: false,
    fullSolutionStreamRestarted: false,
    tutorOutputs: 0,
    structuredTutorOutputs: 0,
    tutorOutputDiagnostics: [],
    actionTrace: [],
    firstAssistantText: "",
    suggestionOffered: false,
    suggestionChosen: false,
    imageQuestionHandled: false,
    imageAnswerHandled: false,
    imageTranscriptionObserved: false,
    solutionBoardValidated: false,
    expectedAnswer: problem.expectedAnswer,
    observedRootAnswer: "",
    deterministicAlignment: null,
    expectedAnswerAligned: false,
    modelLevelLocked: state.session.reasoningLevel === level,
  };
  let turn = await postTurn(state.stateToken, { type: "start" }, cookie);
  observe(turn.events, observations);
  const firstAssistantText = collectText(turn.events);
  observations.firstAssistantText = firstAssistantText;
  state = latestState(turn.events);
  observeRootAnswer(state.stateToken, problem.expectedAnswer, observations);

  if (route === "free_question") {
    turn = await postTurn(state.stateToken, { type: "question", text: user.question }, cookie);
    observe(turn.events, observations); observeTutorOutput(turn.events, observations); observations.questionsAsked += 1; state = latestState(turn.events);
  }
  if (route === "suggestion") {
    const suggestion = state.session.flow.suggestedQuestions[0];
    observations.suggestionOffered = Boolean(suggestion);
    if (suggestion) {
      turn = await postTurn(state.stateToken, { type: "choose_suggestion", suggestionId: suggestion.id }, cookie);
      observe(turn.events, observations); observeTutorOutput(turn.events, observations); observations.suggestionChosen = true; state = latestState(turn.events);
    }
  }
  if (route === "image_question") {
    turn = await postImageTurn(state.stateToken, { type: "image_question" }, cookie);
    observe(turn.events, observations); observeTutorOutput(turn.events, observations); observations.imageQuestionHandled = true; state = latestState(turn.events);
  }
  if (route === "board" && !offered(state, "view_board") && offered(state, "not_understood")) {
    turn = await postTurn(state.stateToken, { type: "choose", gateId: state.session.flow.activeGate.id, choice: "not_understood" }, cookie);
    observe(turn.events, observations); observeTutorOutput(turn.events, observations); observations.gatesHandled += 1; state = latestState(turn.events);
  }
  if (route === "board" && offered(state, "view_board")) {
    observations.boardOffered = true;
    turn = await postTurn(state.stateToken, { type: "choose", gateId: state.session.flow.activeGate.id, choice: "view_board" }, cookie);
    observe(turn.events, observations); observations.gatesHandled += 1;
    const board = turn.events.find((event) => event.name === "board.lesson")?.data;
    observations.boardValidated = validateBoard(board);
    observations.boardVisualKind = board?.visual?.kind ?? null;
    observations.boardFailure = observations.boardValidated ? null : boardFailure(turn.events, board);
    state = latestState(turn.events);
  }
  if (route === "remediation") {
    for (let index = 0; index < 2 && offered(state, "not_understood"); index += 1) {
      turn = await postTurn(state.stateToken, { type: "choose", gateId: state.session.flow.activeGate.id, choice: "not_understood" }, cookie);
      observe(turn.events, observations); observeTutorOutput(turn.events, observations); observations.gatesHandled += 1; observations.remediationObserved = true; state = latestState(turn.events);
    }
  }
  if (["full_solution", "solution_board"].includes(route) && offered(state, "full_solution")) {
    turn = await postTurn(state.stateToken, { type: "choose", gateId: state.session.flow.activeGate.id, choice: "full_solution" }, cookie);
    observations.fullSolutionStreamRestarted = hasStreamedReplay(turn.events);
    const fullSolutionText = collectText(turn.events);
    observations.fullSolutionChars = [...fullSolutionText].length;
    observations.fullSolutionPreview = fullSolutionText.slice(0, 2_000);
    observations.fullSolutionStructured = isDetailedFullSolution(fullSolutionText, problem.text);
    observations.fullSolutionAnswerAligned = containsExpectedSolutionAnswer(fullSolutionText, problem.expectedAnswer, problem.text);
    observe(turn.events, observations); observations.gatesHandled += 1; state = latestState(turn.events);
    if (state.session.flow.stage !== "solution_recall" || state.session.flow.activeGate?.kind !== "solution_review") throw new Error("完整讲解后没有停留在阅读确认任务");
    if (!validSolutionReviewOptions(state.session.flow.activeGate.options)) throw new Error("完整讲解阅读确认任务存在绕过操作");
    if (fullSolutionOnly) return journeyResult(user, problem, level, route, observations, firstAssistantText);
    if (route === "solution_board" && offered(state, "view_board")) {
      turn = await postTurn(state.stateToken, { type: "choose", gateId: state.session.flow.activeGate.id, choice: "view_board" }, cookie);
      const board = turn.events.find((event) => event.name === "board.lesson")?.data;
      observations.boardOffered = true;
      observations.boardValidated = validateBoard(board);
      observations.solutionBoardValidated = observations.boardValidated;
      observations.boardVisualKind = board?.visual?.kind ?? null;
      observations.boardFailure = observations.boardValidated ? null : boardFailure(turn.events, board);
      observe(turn.events, observations); observations.gatesHandled += 1; state = latestState(turn.events);
      if (state.session.flow.activeGate?.kind !== "solution_review") throw new Error("查看板书后没有回到完整讲解阅读任务");
    }
    turn = await postTurn(state.stateToken, { type: "choose", gateId: state.session.flow.activeGate.id, choice: "start_recall" }, cookie);
    observe(turn.events, observations); observations.gatesHandled += 1; state = latestState(turn.events);
    if (state.session.flow.activeGate?.kind === "solution_recall_answer") {
      const rejected = await postTurn(state.stateToken, { type: "answer", gateId: state.session.flow.activeGate.id, answer: problem.expectedAnswer }, cookie);
      observations.recallRejectedFinalAnswer = rejected.events.some((event) => event.name === "answer.result" && event.data?.passed === false);
      observe(rejected.events, observations); observations.gatesHandled += 1; state = latestState(rejected.events);
    }
  }

  if (route === "image_answer") {
    const gate = state.session.flow.activeGate;
    if (gate?.kind === "understanding" && offered(state, "try")) {
      turn = await postTurn(state.stateToken, { type: "choose", gateId: gate.id, choice: "try" }, cookie);
      observe(turn.events, observations); observations.gatesHandled += 1; state = latestState(turn.events);
    }
    const answerGate = state.session.flow.activeGate;
    if (!answerGate || !["node_answer", "solution_recall_answer", "original_answer", "transfer_answer"].includes(answerGate.kind)) throw new Error("图片作答路线没有进入可作答任务");
    turn = await postImageTurn(state.stateToken, { type: "image_answer", gateId: answerGate.id }, cookie);
    observations.imageAnswerHandled = true;
    observations.imageTranscriptionObserved = turn.events.some((event) => event.name === "input.transcribed");
    observe(turn.events, observations); observations.gatesHandled += 1; state = latestState(turn.events);
  }

  let usedWrongAnswer = false;
  let recallAttempts = 0;
  let step = 0;
  while (state.session.flow.stage !== "complete" && step < 18) {
    step += 1;
    const gate = state.session.flow.activeGate;
    if (!gate) throw new Error("学习流程中断：没有当前任务");
    observations.actionTrace.push({ step, stage: state.session.flow.stage, gate: gate.kind });
    let tutorOutputExpected = false;
    if (gate.kind === "understanding") {
      let choice = "try";
      if (route === "guided" && state.session.flow.focus.kind === "problem") choice = "continue";
      if (route === "wrong_recovery" && usedWrongAnswer) choice = "full_solution";
      if (!offered(state, choice)) choice = offered(state, "try") ? "try" : offered(state, "continue") ? "continue" : "full_solution";
      turn = await postTurn(state.stateToken, { type: "choose", gateId: gate.id, choice }, cookie);
      tutorOutputExpected = choice === "continue" || choice === "not_understood";
    } else if (gate.kind === "needs_help") {
      turn = await postTurn(state.stateToken, { type: "question", text: "我还是不知道这一步为什么这样做，请给我一个最具体的提示。" }, cookie);
      observe(turn.events, observations); observeTutorOutput(turn.events, observations); observations.questionsAsked += 1; state = latestState(turn.events);
      turn = await postTurn(state.stateToken, { type: "choose", gateId: state.session.flow.activeGate.id, choice: "full_solution" }, cookie);
    } else if (gate.kind === "node_answer") {
      const answer = route === "wrong_recovery" && !usedWrongAnswer ? wrongAnswerForGate(state.stateToken, gate) : answerForGate(state.stateToken, gate);
      usedWrongAnswer ||= route === "wrong_recovery";
      turn = await postTurn(state.stateToken, { type: "answer", gateId: gate.id, answer }, cookie);
    } else if (gate.kind === "solution_recall_answer") {
      recallAttempts += 1;
      const answer = answerForSolutionRecall(state.stateToken, recallAttempts);
      observations.actionTrace.at(-1).answer = answer;
      turn = await postTurn(state.stateToken, { type: "answer", gateId: gate.id, answer }, cookie);
    } else if (gate.kind === "solution_review") {
      if (!validSolutionReviewOptions(gate.options)) throw new Error("完整讲解阅读确认任务存在绕过操作");
      turn = await postTurn(state.stateToken, { type: "choose", gateId: gate.id, choice: "start_recall" }, cookie);
    } else if (gate.kind === "post_solution") {
      const choices = ["retry_original", "practice_similar", "finish_review"];
      const choice = choices[(Number(user.id.replace(/\D/g, "")) - 1) % choices.length];
      observations.postSolutionChoice = choice;
      turn = await postTurn(state.stateToken, { type: "choose", gateId: gate.id, choice }, cookie);
      if (choice === "finish_review") {
        observe(turn.events, observations); observations.gatesHandled += 1; state = latestState(turn.events);
        if (state.session.flow.stage !== "reviewed_complete") throw new Error("暂时结束后没有进入尚未验证掌握状态");
        turn = await postTurn(state.stateToken, { type: "retry_original" }, cookie);
        observations.reviewedResume = true;
      }
    } else if (gate.kind === "original_answer") {
      const answer = route === "wrong_recovery" && !usedWrongAnswer
        ? wrongAnswerForOriginalGate(state.stateToken)
        : answerForOriginalGate(state.stateToken, problem.expectedAnswer);
      const hidden = openSession(state.stateToken);
      observations.actionTrace.at(-1).answer = answer;
      observations.actionTrace.at(-1).expected = hidden.nodes.find((node) => node.id === hidden.rootNodeId)?.check.answer ?? "";
      usedWrongAnswer ||= route === "wrong_recovery";
      turn = await postTurn(state.stateToken, { type: "answer", gateId: gate.id, answer }, cookie);
    } else if (gate.kind === "transfer_answer") {
      turn = await postTurn(state.stateToken, { type: "answer", gateId: gate.id, answer: answerForGate(state.stateToken, gate) }, cookie);
    } else {
      throw new Error(`未处理的学习任务：${gate.kind}`);
    }
    observe(turn.events, observations); observations.gatesHandled += 1; state = latestState(turn.events);
    const answerResult = turn.events.find((event) => event.name === "answer.result")?.data;
    observations.actionTrace.at(-1).result = answerResult ? { passed: answerResult.passed, explanation: answerResult.explanation } : null;
    observations.actionTrace.at(-1).nextStage = state.session.flow.stage;
    observations.actionTrace.at(-1).nextGate = state.session.flow.activeGate?.kind ?? null;
    if (tutorOutputExpected) observeTutorOutput(turn.events, observations);
    if (usedWrongAnswer && turn.events.some((event) => event.name === "answer.result" && event.data?.passed === false)) observations.wrongAnswerFeedback = true;
  }
  if (state.session.flow.stage !== "complete") throw new Error(`18 个学习回合内没有完成原题：${JSON.stringify(observations.actionTrace)}`);

  if ((Number(problem.id.replace(/\D/g, "")) + Number(user.id.replace(/\D/g, ""))) % 3 === 0) {
    observations.transferRequested = true;
    turn = await postTurn(state.stateToken, { type: "request_transfer" }, cookie);
    observe(turn.events, observations); state = latestState(turn.events);
    const transferGate = state.session.flow.activeGate;
    if (transferGate?.kind !== "transfer_answer") {
      observations.transferUnavailable = true;
    } else {
      turn = await postTurn(state.stateToken, { type: "answer", gateId: transferGate.id, answer: answerForGate(state.stateToken, transferGate) }, cookie);
      observe(turn.events, observations); state = latestState(turn.events);
      observations.transferCompleted = state.session.transferPassed;
    }
  }

  return journeyResult(user, problem, level, route, observations, firstAssistantText);
}

function journeyResult(user, problem, level, route, observations, firstAssistantText) {
  return {
    userId: user.id,
    problemId: problem.id,
    subject: problem.subject,
    gradeBand: problem.gradeBand,
    difficulty: problem.difficulty,
    level,
    route,
    status: "passed",
    ...observations,
    printerLikeSse: observations.sseDeltaCount >= 2,
    noEarlyAnswerLeak: !containsEarlyAnswerLeak(firstAssistantText, problem.expectedAnswer, problem.text),
  };
}

async function analyzeWithRetry(problem, level, cookie) {
  let lastError;
  for (let attempts = 1; attempts <= 2; attempts += 1) {
    try {
      const form = new FormData();
      form.set("stage", "full"); form.set("provider", "doubao"); form.set("reasoningLevel", level);
      form.set("problem", JSON.stringify({ text: problem.text, childWork: problem.childWork, subject: problem.subject, gradeBand: problem.gradeBand, confidence: 1, userRevised: true }));
      const response = await fetch(`${apiBase}/learning/analyze`, { method: "POST", headers: headers(cookie), body: form, signal: AbortSignal.timeout(240_000) });
      const events = await readSse(response);
      const state = latestState(events, "graph");
      return { state, attempts };
    } catch (error) { lastError = error; }
  }
  throw new Error(`两次分析均失败：${message(lastError)}`);
}

async function postTurn(stateToken, input, cookie) {
  const response = await fetch(`${apiBase}/learning/turn`, {
    method: "POST",
    headers: { ...headers(cookie), "Content-Type": "application/json" },
    body: JSON.stringify({ stateToken, input }),
    signal: AbortSignal.timeout(240_000),
  });
  return { events: await readSse(response) };
}

async function postImageTurn(stateToken, input, cookie) {
  const form = new FormData();
  form.set("stateToken", stateToken);
  form.set("input", JSON.stringify(input));
  form.set("image", new Blob([imageFixture], { type: "image/png" }), "student-work.png");
  const response = await fetch(`${apiBase}/learning/turn`, {
    method: "POST",
    headers: headers(cookie),
    body: form,
    signal: AbortSignal.timeout(240_000),
  });
  return { events: await readSse(response) };
}

async function consent() {
  const response = await fetch(`${apiBase}/consent`, { method: "POST", headers: { Origin: appOrigin } });
  if (!response.ok) throw new Error(`同意接口失败：${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("同意接口没有返回会话凭证");
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

function latestState(events, eventName = "flow.update") {
  const state = events.findLast((event) => event.name === eventName)?.data;
  if (!state?.session || !state.stateToken) throw new Error(`缺少 ${eventName} 学习状态`);
  return state;
}

function observe(events, observations) {
  observations.sseDeltaCount += events.filter((event) => event.name === "message.delta" && event.data?.text).length;
  observations.milestones += events.filter((event) => event.name === "flow.milestone").length;
  observations.pathObserved ||= events.some((event) => event.name === "path.updated");
  const suggestionGroups = events.filter((event) => event.name === "flow.suggestions");
  observations.suggestionGroups += suggestionGroups.length;
  observations.suggestionCount += suggestionGroups.reduce((sum, event) => sum + (event.data?.suggestions?.length ?? 0), 0);
}

function observeTutorOutput(events, observations) {
  const text = collectText(events);
  if (!text) return;
  observations.tutorOutputs += 1;
  const structured = isStructuredTutorOutput(text);
  if (structured) observations.structuredTutorOutputs += 1;
  observations.tutorOutputDiagnostics.push({
    chars: [...text.trim()].length,
    hasParagraphs: text.includes("\n\n"),
    hasFormatting: /(?:^|\n)(?:#{2,4}\s|>\s|[-*]\s|\d+[.、)]\s)|\*\*[^*]+\*\*/m.test(text),
    preview: text.slice(0, 600),
  });
}

function isStructuredTutorOutput(text) {
  return [...text.trim()].length >= 80
    && text.includes("\n\n")
    && /(?:^|\n)(?:#{2,4}\s|>\s|[-*]\s|\d+[.、)]\s)|\*\*[^*]+\*\*/m.test(text);
}

function offered(state, choice) {
  return Boolean(state.session.flow.activeGate?.options?.some((option) => option.id === choice));
}

function validSolutionReviewOptions(options) {
  const ids = (options ?? []).map((option) => option.id);
  return ids.includes("start_recall") && ids.every((id) => id === "start_recall" || id === "view_board");
}

function answerForGate(stateToken, gate) {
  const session = openSession(stateToken);
  if (gate.kind === "transfer_answer") return session.transferCheck?.answer ?? "";
  return session.nodes.find((node) => node.id === gate.nodeId)?.check.answer ?? "";
}

function answerForOriginalGate(stateToken, expectedAnswer) {
  const session = openSession(stateToken);
  const rootCheck = session.nodes.find((node) => node.id === session.rootNodeId)?.check;
  return rootCheck?.type === "choice" ? rootCheck.answer : expectedAnswer;
}

function answerForSolutionRecall(stateToken, attempt = 1) {
  const session = openSession(stateToken);
  if (attempt > 1) return `我换一种更完整的说法：${session.problemGuide.approach}`;
  const solution = session.nodes.find((node) => node.id === session.rootNodeId)?.check.explanation ?? "";
  const segments = solution.split(/[。；\n]/).map((item) => item.replace(/^\s*(?:\d+[.、)]\s*)?/, "").trim()).filter(Boolean);
  return segments.find((item) => /先|根据|利用|代入|设|列|化简|移项|相等|关系|条件|推出|计算|比较|画|连接|作|除以|乘以|加上|减去|守恒|受力|折射|反应/u.test(item))
    ?? `我先按题目条件做第一步：${session.problemGuide.approach.split(/[，；。]/)[0]}`;
}

function wrongAnswerForGate(stateToken, gate) {
  const session = openSession(stateToken);
  const check = session.nodes.find((node) => node.id === gate.nodeId)?.check;
  if (check?.type === "choice") return check.choices?.find((choice) => choice !== check.answer) ?? check.answer;
  return "明显错误的答案";
}

function wrongAnswerForOriginalGate(stateToken) {
  const session = openSession(stateToken);
  const check = session.nodes.find((node) => node.id === session.rootNodeId)?.check;
  if (check?.type === "choice") return check.choices?.find((choice) => choice !== check.answer) ?? "明显错误的答案";
  return "明显错误的答案";
}

function validateBoard(board) {
  if (board?.quality?.status === "safe_fallback") return false;
  if (!board || !Array.isArray(board.blocks) || board.blocks.length < 4 || !Array.isArray(board.annotations) || board.annotations.length < 2) return false;
  const blocks = new Map(board.blocks.map((block) => [block.id, block.content]));
  const annotationsValid = new Set(board.annotations.map((item) => item.blockId)).size >= 2 && board.annotations.every((item) => blocks.get(item.blockId)?.includes(item.target) && item.reason?.length >= 8);
  return annotationsValid && validateBoardVisual(board.visual);
}

function validateBoardVisual(visual) {
  if (visual == null) return true;
  if (!new Set(["geometry", "optics", "process", "relation"]).has(visual.kind)) return false;
  if (!visual.title || !visual.evidence || !visual.caption || !Array.isArray(visual.elements) || visual.elements.length < 2 || visual.elements.length > 16) return false;
  return visual.elements.every((element) => new Set(["point", "line", "arrow", "circle", "rect", "arc"]).has(element.type)
    && Number.isFinite(element.x) && element.x >= 0 && element.x <= 100
    && Number.isFinite(element.y) && element.y >= 0 && element.y <= 68);
}

function boardFailure(events, board) {
  const unavailable = events.find((event) => event.name === "presentation.unavailable")?.data?.message;
  if (unavailable) return unavailable;
  if (!board) return "没有返回 board.lesson";
  if (board.quality?.status === "safe_fallback") return `板书进入安全降级：${board.quality.reason || "未返回原因"}`;
  if (!Array.isArray(board.blocks) || board.blocks.length < 4) return "板书区块少于 4 个";
  if (!Array.isArray(board.annotations) || board.annotations.length < 2) return "板书重点少于 2 个";
  const blocks = new Map(board.blocks.map((block) => [block.id, block.content]));
  if (new Set(board.annotations.map((item) => item.blockId)).size < 2) return "重点没有覆盖至少两个区块";
  if (board.annotations.some((item) => !blocks.get(item.blockId)?.includes(item.target))) return "重点不是板书中的真实连续原文";
  if (board.annotations.some((item) => item.reason?.length < 8)) return "重点理由过短";
  if (!validateBoardVisual(board.visual)) return "板书示意图结构不合法";
  return "板书结构未通过测试验收";
}

function collectText(events) {
  return events.reduce((text, event) => {
    if (event.name === "message.reset") return "";
    return event.name === "message.delta" ? text + (event.data?.text ?? "") : text;
  }, "");
}

function hasStreamedReplay(events) {
  const resetIndex = events.findLastIndex((event) => event.name === "message.reset");
  if (resetIndex < 0) return false;
  return events.slice(resetIndex + 1).filter((event) => event.name === "message.delta" && event.data?.text).length > 1;
}

function isDetailedFullSolution(text, problemText) {
  return isDetailedSolution(text, problemText);
}

function containsAnswer(text, answer, problemText) {
  const normalizedText = normalizeAnswer(text);
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedProblem = normalizeAnswer(problemText);
  if (!normalizedAnswer) return false;
  if (/^\d+(?:\.\d+)?(?:[a-z/%^\d]*)$/i.test(normalizedAnswer)) {
    const pattern = new RegExp(`(?<![\\d.])${escapeRegex(normalizedAnswer)}(?![\\d.])`, "g");
    return (normalizedText.match(pattern)?.length ?? 0) > (normalizedProblem.match(pattern)?.length ?? 0);
  }
  if (normalizedAnswer.length < 2) return false;
  return occurrences(normalizedText, normalizedAnswer) > occurrences(normalizedProblem, normalizedAnswer);
}

function containsEarlyAnswerLeak(text, answer, problemText) {
  const comparableText = comparableAnswerText(withoutPedagogicalExamples(text));
  const comparableAnswer = comparableAnswerText(answer);
  const comparableProblem = comparableAnswerText(problemText);
  if (!comparableAnswer || occurrences(comparableText, comparableAnswer) <= occurrences(comparableProblem, comparableAnswer)) return false;
  if (!/\d/.test(comparableAnswer)) return true;
  const escaped = escapeRegex(comparableAnswer);
  const cue = "(?:答案|最终|所以|因此|可得|得到|求得|应为|需要|等于)";
  if (new RegExp(`${cue}.{0,16}${escaped}|${escaped}.{0,12}${cue}`, "u").test(comparableText)) return true;
  const numeric = comparableAnswer.match(/^[-+]?\d+(?:\.\d+)?$/)?.[0];
  return Boolean(numeric && new RegExp(`(?:x|y|k|a|b|c)=${escapeRegex(numeric)}(?![\d.])`, "i").test(comparableText));
}

function withoutPedagogicalExamples(text) {
  return String(text ?? "")
    .split(/\n{2,}/)
    .filter((paragraph) => !/(?:看个|举个|简单的|同类型)?例子|例如|比如/.test(paragraph))
    .join("\n\n");
}

function comparableAnswerText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase()
    .replace(/\\(?:mathrm|text|boldsymbol)\{([^{}]*)\}/g, "$1")
    .replace(/[\s，。；、：:！？!?“”'"`*_#$\\{}]/g, "");
}

function containsExpectedSolutionAnswer(text, expectedAnswer, problemText) {
  if (containsAnswer(text, expectedAnswer, problemText)) return true;
  if (equivalentAnswer(text, expectedAnswer)) return true;
  const formulas = [...text.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)]
    .map((match) => normalizeFormulaForAssessment((match[1] ?? match[2] ?? "").trim()))
    .filter(Boolean);
  return formulas.some((formula) => deterministicAnswerMatch(expectedAnswer, formula) === true);
}

function normalizeFormulaForAssessment(formula) {
  let normalized = formula;
  for (let index = 0; index < 3; index += 1) {
    normalized = normalized.replace(/\\(?:mathrm|text)\{([^{}]*)\}/g, "$1");
  }
  return normalized.replace(/^\\(?:boldsymbol|boxed|mathbf)\{([\s\S]*)\}$/, "$1");
}

function occurrences(value, target) { return value.split(target).length - 1; }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function equivalentAnswer(actual, expected) {
  const left = normalizeAnswer(actual); const right = normalizeAnswer(expected);
  if (left && right && (left.includes(right) || right.includes(left))) return true;
  const formulas = [...String(actual).matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)]
    .map((match) => normalizeFormulaForAssessment((match[1] ?? match[2] ?? "").trim()));
  if (formulas.some((formula) => deterministicAnswerMatch(expected, formula) === true)) return true;
  if (/没有停止|并没有停止|未停止/.test(expected) && /正逆反应速率相等/.test(expected)) {
    return /没有停止|并没有停止|未停止/.test(actual)
      && (/正反应速率.{0,12}逆反应速率.{0,8}相等/.test(actual) || /正逆反应速率相等/.test(actual));
  }
  return false;
}

function observeRootAnswer(stateToken, expectedAnswer, observations) {
  const hidden = openSession(stateToken);
  const rootAnswer = hidden.nodes.find((node) => node.id === hidden.rootNodeId)?.check.answer ?? "";
  const deterministicAlignment = deterministicAnswerMatch(expectedAnswer, rootAnswer);
  observations.observedRootAnswer = rootAnswer;
  observations.deterministicAlignment = deterministicAlignment;
  observations.expectedAnswerAligned = deterministicAlignment === true
    || (deterministicAlignment === null && equivalentAnswer(rootAnswer, expectedAnswer));
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\\sqrt\s*\{([^}]*)\}/g, "√$1")
    .replace(/\\(?:mathrm|text)\s*\{([^}]*)\}/g, "$1")
    .replace(/[{}$\\]/g, "")
    .replace(/厘米|cm/g, "cm").replace(/米|m/g, "m").replace(/秒|s/g, "s")
    .replace(/千克|公斤|kg/g, "kg").replace(/克|g/g, "g").replace(/牛顿|牛|n/g, "n")
    .replace(/欧姆|欧|ω|Ω/g, "ohm").replace(/摩尔|mol/g, "mol").replace(/个/g, "")
    .replace(/被氧化/g, "氧化").replace(/显酸性/g, "酸性").replace(/显碱性/g, "碱性")
    .replace(/\^/g, "")
    .replace(/[^\p{L}\p{N}.%+\-=*/√]+/gu, "");
}

function headers(cookie) { return { Origin: appOrigin, Cookie: cookie }; }
function message(error) { return error instanceof Error ? error.message : String(error); }

function buildSummary(items) {
  const passed = items.filter((item) => item.status === "passed");
  const fullSolutions = items.filter((item) => item.route === "full_solution" || item.route === "solution_board");
  const analysisPassed = items.filter((item) => !String(item.failure ?? "").includes("两次分析均失败"));
  const answerAlignmentReviewFlags = passed.filter((item) => !item.expectedAnswerAligned).length;
  const subjectCompletionRates = Object.fromEntries([...new Set(items.map((item) => item.subject))].map((subject) => {
    const subjectItems = items.filter((item) => item.subject === subject);
    return [subject, subjectItems.filter((item) => item.status === "passed").length / subjectItems.length];
  }));
  return {
    users: new Set(items.map((item) => item.userId)).size,
    journeys: items.length,
    passed: passed.length,
    failed: items.length - passed.length,
    functionalCompletionRate: items.length ? passed.length / items.length : 0,
    analysisSuccessRate: items.length ? analysisPassed.length / items.length : 0,
    firstTryAnalysisRate: passed.length ? passed.filter((item) => item.analysisAttempts === 1).length / passed.length : 0,
    printerLikeSseRate: passed.length ? passed.filter((item) => item.printerLikeSse).length / passed.length : 0,
    modelLevelLockRate: passed.length ? passed.filter((item) => item.modelLevelLocked).length / passed.length : 0,
    earlyAnswerLeakCount: passed.filter((item) => !item.noEarlyAnswerLeak).length,
    answerAlignmentReviewFlags,
    subjectCompletionRates,
    boardJourneys: passed.filter((item) => item.route === "board").length,
    boardOffered: passed.filter((item) => item.boardOffered).length,
    boardValidated: passed.filter((item) => item.boardValidated).length,
    remediationJourneys: passed.filter((item) => item.remediationObserved).length,
    wrongRecoveryJourneys: passed.filter((item) => item.route === "wrong_recovery").length,
    fullSolutionJourneys: fullSolutions.length,
    wrongAnswerFeedback: passed.filter((item) => item.wrongAnswerFeedback).length,
    transferRequested: passed.filter((item) => item.transferRequested).length,
    transferCompleted: passed.filter((item) => item.transferCompleted).length,
    transferUnavailable: passed.filter((item) => item.transferUnavailable).length,
    postSolutionPaths: Object.fromEntries(["retry_original", "practice_similar", "finish_review"].map((choice) => [choice, passed.filter((item) => item.postSolutionChoice === choice).length])),
    reviewedResume: passed.filter((item) => item.reviewedResume).length,
    suggestionJourneys: passed.filter((item) => item.route === "suggestion").length,
    suggestionsOffered: passed.filter((item) => item.route === "suggestion" && item.suggestionOffered).length,
    suggestionsChosen: passed.filter((item) => item.suggestionChosen).length,
    imageQuestionJourneys: passed.filter((item) => item.route === "image_question").length,
    imageQuestionsHandled: passed.filter((item) => item.imageQuestionHandled).length,
    imageAnswerJourneys: passed.filter((item) => item.route === "image_answer").length,
    imageAnswersHandled: passed.filter((item) => item.imageAnswerHandled && item.imageTranscriptionObserved).length,
    solutionBoardJourneys: passed.filter((item) => item.route === "solution_board").length,
    solutionBoardsValidated: passed.filter((item) => item.solutionBoardValidated).length,
    recallRejectedFinalAnswer: passed.filter((item) => item.recallRejectedFinalAnswer).length,
    detailedFullSolutions: fullSolutions.filter((item) => item.status === "passed" && item.fullSolutionStructured && item.fullSolutionChars >= 180).length,
    alignedFullSolutions: fullSolutions.filter((item) => item.status === "passed" && item.fullSolutionAnswerAligned).length,
    fullSolutionStreamRestarts: fullSolutions.filter((item) => item.fullSolutionStreamRestarted).length,
    tutorOutputs: passed.reduce((sum, item) => sum + (item.tutorOutputs ?? 0), 0),
    structuredTutorOutputs: passed.reduce((sum, item) => sum + (item.structuredTutorOutputs ?? 0), 0),
    coverage: {
      subjects: [...new Set(items.map((item) => item.subject))],
      gradeBands: [...new Set(items.map((item) => item.gradeBand))],
      difficulties: [...new Set(items.map((item) => item.difficulty))],
      levels: [...new Set(items.map((item) => item.level))],
      routes: [...new Set(items.map((item) => item.route))],
    },
  };
}

function createUsers() {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `U${String(index + 1).padStart(2, "0")}`,
    profile: ["谨慎型", "快速尝试型", "基础薄弱型", "爱追问型", "容易放弃型"][index % 5],
    question: ["为什么第一步要先看这个条件？", "能不能换一个更小的数字讲？", "这个关系和原题哪句话有关？", "如果条件改变，方法还一样吗？", "我应该怎样检查自己有没有做错？"][index % 5],
  }));
}

function createCases() {
  return [
    p("P01", "math", "primary", "basic", "48盒彩笔平均分给6个小组，每组分到多少盒？", "48×6=288", "8"),
    p("P02", "math", "primary", "medium", "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", "180÷5×3=108", "300"),
    p("P03", "math", "primary", "hard", "一列快车长220米，每秒行21米；一列慢车长180米，每秒行16米。两车齐头并进，快车超过慢车要多少秒？", "21-16=5；220÷5=44", "44秒"),
    p("P04", "math", "primary", "extreme", "甲数的五分之三等于乙数的七分之四。甲数是40，乙数是多少？", "40×3÷5=24", "42"),
    p("P05", "math", "junior", "basic", "解方程：3(x-2)=18。", "3x-2=18", "8"),
    p("P06", "math", "junior", "medium", "直角三角形两直角边分别为3和4，求斜边长。", "3+4=7", "5"),
    p("P07", "math", "junior", "hard", "已知二次函数 y=x²-4x+3，求顶点坐标。", "不知道怎样配方", "(2,-1)"),
    p("P08", "math", "junior", "extreme", "若关于x的方程 x²-2(k+1)x+k²-1=0 有两个相等实根，求k。", "判别式不会算", "-1"),
    p("P09", "math", "senior", "basic", "已知2^x=8，求x。", "2x=8", "3"),
    p("P10", "math", "senior", "medium", "解方程 log₂x=3。", "不知道对数和指数的关系", "8"),
    p("P11", "math", "senior", "hard", "函数f(x)=x³-3x在x=1处的导数是多少？", "不会求导", "0"),
    p("P12", "math", "senior", "extreme", "椭圆x²/4+y²=1的右焦点坐标是什么？", "不会求焦距", "(√3,0)"),
    p("P13", "physics", "junior", "basic", "汽车5秒内匀速行驶50米，它的速度是多少？", "50×5=250", "10 m/s"),
    p("P14", "physics", "junior", "medium", "物体质量540克、体积200立方厘米，密度是多少？", "540+200", "2.7 g/cm³"),
    p("P15", "physics", "junior", "hard", "电阻两端电压6伏，通过电流0.3安，电阻是多少？", "6×0.3", "20 Ω"),
    p("P16", "physics", "junior", "extreme", "重为600牛的人站在重为300牛的平台上，用滑轮组匀速提升自己和平台，承担总重的绳子有3段，不计摩擦，拉力多大？", "600+300=900", "300 N"),
    p("P17", "physics", "senior", "basic", "质量2千克的物体受到10牛合力，加速度是多少？", "写出F=ma但不会代入", "5 m/s²"),
    p("P18", "physics", "senior", "medium", "质量1千克的物体从20米高处自由落下，不计阻力，落地前速度多大？取g=10m/s²。", "用v=gt但不知道时间", "20 m/s"),
    p("P19", "physics", "senior", "hard", "平抛物体初速度10m/s，从20m高处抛出，取g=10m/s²，落地时间是多少？", "不会分解运动", "2 s"),
    p("P20", "physics", "senior", "extreme", "质量1kg物块以6m/s滑上粗糙斜面，沿斜面加速度大小2m/s²，多久后速度减为0？", "6÷2=3", "3 s"),
    p("P21", "chemistry", "junior", "basic", "配平化学方程式：H₂ + O₂ → H₂O。", "H₂+O₂→2H₂O", "2H₂+O₂→2H₂O"),
    p("P22", "chemistry", "junior", "medium", "100克溶液中含20克溶质，溶质质量分数是多少？", "100÷20=5", "20%"),
    p("P23", "chemistry", "junior", "hard", "某溶液pH=3，它显酸性还是碱性？", "3小所以是碱性", "酸性"),
    p("P24", "chemistry", "junior", "extreme", "实验室用过氧化氢制氧气，写出反应的化学方程式。", "H₂O₂→H₂O+O₂", "2H₂O₂→2H₂O+O₂"),
    p("P25", "chemistry", "senior", "basic", "2 mol O₂含有多少个氧分子？", "2×22.4", "1.204×10²⁴个"),
    p("P26", "chemistry", "senior", "medium", "反应2H₂+O₂→2H₂O中，4 mol H₂完全反应需要多少mol O₂？", "4mol", "2 mol"),
    p("P27", "chemistry", "senior", "hard", "铁元素化合价从0升到+3，铁被氧化还是被还原？", "升高所以被还原", "被氧化"),
    p("P28", "chemistry", "senior", "extreme", "可逆反应达到化学平衡后，正反应是否停止？说明理由。", "达到平衡所以停止", "没有停止，正逆反应速率相等"),
  ];
}

function p(id, subject, gradeBand, difficulty, text, childWork, expectedAnswer) {
  return { id, subject, gradeBand, difficulty, text, childWork, expectedAnswer };
}
