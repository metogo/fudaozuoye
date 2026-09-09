import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export async function validateRelease(run) {
  for (const task of ["build:function", "typecheck", "test", "lint"]) await run("npm", ["run", task]);
  await run("npm", ["run", "build:cloudbase", "--", "--webpack"]);
}

/** A frontend deployment is unreachable until the live backend has passed. */
export async function releaseCloudbase(steps) {
  await steps.validate();
  const before = await steps.configFingerprint();
  await steps.deployBackend();
  if (before !== await steps.configFingerprint()) throw new Error("线上函数配置发生变化，停止发布；不得自动覆盖或回滚密钥");
  const cases = await steps.verifyBackend();
  await steps.deployFrontend();
  await steps.verifyBrowser(cases[0]);
}

async function main() {
  const config = JSON.parse(await readFile(new URL("../cloudbaserc.json", import.meta.url), "utf8"));
  const env = ["--env-id", config.envId];
  const run = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${command} 执行失败，后续发布已停止`)));
  });
  await releaseCloudbase({
    validate: () => validateRelease(run),
    configFingerprint: async () => {
      // Never print CLI detail responses: they contain secrets and signed code URLs.
      let stdout;
      try { ({ stdout } = await promisify(execFile)("tcb", ["fn", "detail", "learning-api", ...env, "--json"], { maxBuffer: 4000000 })); }
      catch { throw new Error("无法读取线上函数配置，停止发布"); }
      const { data } = JSON.parse(stdout.slice(stdout.indexOf("{")));
      if (!data?.Environment || !data.Runtime) throw new Error("线上配置快照不完整，停止发布");
      const variables = [...data.Environment.Variables].sort((a, b) => a.Key.localeCompare(b.Key));
      return createHash("sha256").update(JSON.stringify({ variables, runtime: data.Runtime, timeout: data.Timeout,
        memory: data.MemorySize, type: data.Type, protocol: data.ProtocolType })).digest("hex");
    },
    // Code-only update deliberately avoids cloudbaserc envVariables interpolation/config replacement.
    deployBackend: () => run("tcb", ["fn", "code", "update", "learning-api", "--dir", "functions/learning-api", ...env, "--json"]),
    verifyBackend: async () => {
      await (await import("./verify-question-statistics-release.mjs")).verifyQuestionStatistics(config.app.envVariables.NEXT_PUBLIC_API_BASE_URL);
      await (await import("./verify-recognition-release.mjs")).verifyRecognition();
      return (await import("./verify-knowledge-map-release.mjs")).verifyKnowledgeMaps();
    },
    deployFrontend: () => run("tcb", ["app", "deploy", config.app.serviceName, ...env, "--framework", "next",
      "--build-command", "npm run build:cloudbase -- --webpack", "--output-dir", "out", "--deploy-path", config.app.deployPath,
      "--enable-git-ignore", "--ignore", ".env*,.git/**,.codex/**,.agents/**", "--force", "--json"]),
    verifyBrowser: async sample => (await import("./verify-knowledge-map-browser.mjs")).verifyKnowledgeMapBrowser(sample),
  });
  console.log("发布验收通过：配置未变，线上真实模型图谱、浏览器节点连线和图片导出均已验证。");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
