/** Explicit local diagnostic: three synthetic requests; no statistics endpoint or photos. */
const origin = "http://localhost:3000";
const base = "http://localhost:9000/api";
const consent = await fetch(`${base}/consent`, { method: "POST", headers: { Origin: origin } });
if (!consent.ok) throw new Error(`Consent: ${consent.status}`);
const cookie = consent.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Consent credential missing");
const headers = { Origin: origin, Cookie: cookie };
async function events(response, onEvent) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
      let end;
      while ((end = pending.indexOf("\n\n")) >= 0) {
        const frame = pending.slice(0, end); pending = pending.slice(end + 2);
        const event = frame.match(/^event: (.+)$/m)?.[1];
        const data = frame.match(/^data: (.+)$/m)?.[1];
        if (event && data) onEvent(event, JSON.parse(data));
      }
    }
  } finally { reader.releaseLock(); }
}
async function analyze(stage, values, onEvent) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ stage, provider: "doubao", reasoningLevel: "light", ...values })) form.set(key, value);
  await events(await fetch(`${base}/learning/analyze`, { method: "POST", headers, body: form, signal: AbortSignal.timeout(60000) }), onEvent);
}
for (const withMap of [false, true, false]) {
  const start = performance.now(), times = { withMap };
  const elapsed = () => Math.round(performance.now() - start);
  let problem, state;
  await analyze("recognize_text", { text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？" }, (event, data) => {
    if (event === "recognized") { problem = data; times.recognizedMs = elapsed(); }
    if (event === "error") throw new Error("Recognition failed");
  });
  if (!problem) throw new Error("No recognized problem");
  await analyze("full", { problem: JSON.stringify(problem) }, (event, data) => {
    if (event === "graph") { state = data; times.sessionMs = elapsed(); }
  });
  if (!state) throw new Error("No session");
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
  const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const map = withMap ? post("/learning/knowledge-map", { stateToken: state.stateToken, stream: true, earlyRoot: true }).then(response => events(response, (event, data) => {
    if (event === "map.root" && data.node && !times.rootMs) times.rootMs = elapsed();
  })).catch(error => { if (!controller.signal.aborted) throw error; }) : Promise.resolve();
  let text = "";
  try {
    await events(await post("/learning/turn", { stateToken: state.stateToken, input: { type: "start" } }), (event, data) => {
      if (event === "error") throw new Error("Turn failed");
      if (event !== "message.delta") return;
      text += data.text;
      times.headingMs ??= elapsed();
      if (text.replace(/^\s*#{1,6}(?:[ \t]+[^\n]*)?(?:\n|$)/, "").trim()) {
        times.bodyMs = elapsed();
        controller.abort(); // First body token is sufficient; no follow-up generation.
      }
    });
  } catch (error) { if (!controller.signal.aborted) throw error; }
  finally { controller.abort(); await map; }
  if (!times.bodyMs) throw new Error("No body token");
  console.log(JSON.stringify(times));
}
