import { describe, expect, it, vi } from "vitest";
// @ts-expect-error The operational Node entrypoint is JavaScript, exercised directly here.
import { releaseCloudbase, validateRelease } from "../scripts/release-cloudbase.mjs";
import { readFileSync } from "node:fs";
// @ts-expect-error Exercise the same Node readiness check used by the release entrypoint.
import { waitForKnowledgeMapBackend } from "../scripts/knowledge-map-release-gate.mjs";

function steps() {
  return { validate: vi.fn(), configFingerprint: vi.fn().mockResolvedValue("same"), deployBackend: vi.fn(),
    verifyBackend: vi.fn().mockResolvedValue([{}]), deployFrontend: vi.fn(), verifyBrowser: vi.fn() };
}
describe("发布不可跳过线上图谱验收", () => {
  it("正式发布检查覆盖测试代码，并要求全库零错误、零警告", async () => {
    const run = vi.fn<(command: string, args: string[]) => Promise<void>>().mockResolvedValue(undefined);
    await validateRelease(run);
    expect(run.mock.calls).toEqual([
      ["npm", ["run", "build:function"]], ["npm", ["run", "typecheck"]],
      ["npm", ["run", "test"]], ["npm", ["run", "lint"]],
      ["npm", ["run", "build:cloudbase", "--", "--webpack"]],
    ]);
    const manifest: { scripts: Record<string, string> } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(manifest.scripts.lint).toBe("eslint . --max-warnings 0");
    expect(manifest.scripts).not.toHaveProperty("lint:release");
  });
  it("全库 lint 未通过时停止构建与发布，不降级成局部检查", async () => {
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[1] === "lint") throw new Error("lint failed");
    });
    const actions = steps();
    actions.validate.mockImplementation(() => validateRelease(run));
    await expect(releaseCloudbase(actions)).rejects.toThrow("lint failed");
    expect(run).toHaveBeenLastCalledWith("npm", ["run", "lint"]);
    expect(actions.configFingerprint).not.toHaveBeenCalled();
    expect(actions.deployBackend).not.toHaveBeenCalled();
    expect(actions.deployFrontend).not.toHaveBeenCalled();
  });
  it("顺序必须是检查、后端、配置核对、真实生成、前端、浏览器", async () => {
    const calls: string[] = [], actions = steps();
    for (const key of Object.keys(actions) as (keyof typeof actions)[]) actions[key].mockImplementation(async () => {
      calls.push(key); return key === "configFingerprint" ? "same" : [{}];
    });
    await releaseCloudbase(actions);
    expect(calls).toEqual(["validate", "configFingerprint", "deployBackend", "configFingerprint", "verifyBackend", "deployFrontend", "verifyBrowser"]);
  });
  it.each(["validate", "deployBackend", "verifyBackend"] as const)("%s失败后禁止发布前端", async key => {
    const actions = steps(); actions[key].mockRejectedValue(new Error("failure"));
    await expect(releaseCloudbase(actions)).rejects.toThrow();
    expect(actions.deployFrontend).not.toHaveBeenCalled();
  });
  it("配置变化时停止，不能静默覆盖生产密钥", async () => {
    const actions = steps(); actions.configFingerprint.mockResolvedValueOnce("before").mockResolvedValueOnce("after");
    await expect(releaseCloudbase(actions)).rejects.toThrow("配置发生变化");
    expect(actions.verifyBackend).not.toHaveBeenCalled();
    expect(actions.deployFrontend).not.toHaveBeenCalled();
  });
  it("浏览器失败不能报告发布验收成功", async () => {
    const actions = steps(); actions.verifyBrowser.mockRejectedValue(new Error("图谱未完成"));
    await expect(releaseCloudbase(actions)).rejects.toThrow("图谱未完成");
  });
  it("旧新实例交替返回时，必须连续两次收到新协议", async () => {
    const states = [false, true, false, true, true];
    const fetcher = vi.fn(async () => Response.json({ capabilities: { knowledgeMapStream: states.shift() ? 1 : undefined } }));
    await waitForKnowledgeMapBackend("https://example.invalid", fetcher, async () => undefined);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("始终返回旧版本时到期失败，不会无限等待或假通过", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => Response.json({ providers: [] }));
      await expect(waitForKnowledgeMapBackend("https://example.invalid", fetcher, async (ms: number) => { vi.setSystemTime(Date.now() + ms); })).rejects.toThrow("禁止发布前端");
      expect(fetcher).toHaveBeenCalledTimes(30);
    } finally { vi.useRealTimers(); }
  });
});
