import { describe, expect, it, vi } from "vitest";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import {
  boardSuggestionTool, emitProviderDelta, extractText, extractToolArguments,
  parseSimilarCheck, problemSolutionTool, similarCheckTool, transferCheckTool,
} from "@/lib/learning/providers/model-support";

const target = () => analyzeMock(recognizeMock("math", "primary"), "doubao").nodes.find(node => node.kind === "concept")!;

describe("模型协议边界", () => {
  it("公开的工具契约包含固定函数名与受限参数", () => {
    expect((transferCheckTool().function as any).name).toBe("submit_transfer_check");
    expect((problemSolutionTool().function as any).parameters.required).toEqual(["originalAnswer", "originalExplanation"]);
    expect((boardSuggestionTool().function as any).parameters.properties.layout.enum).toEqual(["relation", "steps", "comparison", "formula"]);
    expect((similarCheckTool("choice").function as any).parameters.properties.type.enum).toEqual(["choice"]);
  });

  it("相似选择题保留实际选项文字，并拒绝重复、错类型与错误答案", () => {
    const node = target();
    const good = { prompt: "4盒彩笔平均分给2人，每人几盒？", type: "choice", choices: ["1盒", "2盒", "8盒"], answer: "2盒", explanation: "总数平均分成两份，所以每份是2盒。" };
    const parsed = parseSimilarCheck(good, node);
    expect(parsed.answer).toBe("2盒");
    expect(() => parseSimilarCheck({ ...good, prompt: node.check.prompt }, node)).toThrow("不能复述");
    expect(() => parseSimilarCheck({ ...good, type: "short_text" }, node)).toThrow("不一致");
    expect(() => parseSimilarCheck({ ...good, choices: ["2盒", "2盒"] }, node)).toThrow("选项不合法");
    expect(() => parseSimilarCheck({ ...good, answer: "3盒" }, node)).toThrow("标准答案不在选项中");
  });

  it("从两种协议读取文本和函数参数，并明确拒绝缺失内容", () => {
    expect(extractToolArguments({ choices: [{ message: { tool_calls: [{ function: { arguments: '{"x":1}' } }] } }] })).toBe('{"x":1}');
    expect(() => extractToolArguments({ choices: [] })).toThrow("没有调用");
    expect(extractText({ choices: [{ message: { content: "chat text" } }] }, "chat-completions")).toBe("chat text");
    expect(extractText({ output_text: "response text" }, "responses")).toBe("response text");
    expect(extractText({ output: [{ content: [{ text: "A" }, { text: "B" }] }] }, "responses")).toBe("AB");
    expect(() => extractText({}, "responses")).toThrow("没有可读取");
  });

  it("流式事件只在完整结束时返回 true，并区分截断与格式错误", () => {
    const delta = vi.fn();
    expect(emitProviderDelta("event: ping", "chat-completions", delta)).toBe(false);
    expect(emitProviderDelta("data: [DONE]", "chat-completions", delta)).toBe(true);
    expect(emitProviderDelta('data: {"choices":[{"delta":{"content":"第一步"}}]}', "chat-completions", delta)).toBe(false);
    expect(delta).toHaveBeenCalledWith("第一步");
    expect(emitProviderDelta('data: {"choices":[{"finish_reason":"stop"}]}', "chat-completions", delta)).toBe(true);
    expect(emitProviderDelta('data: {"type":"response.output_text.delta","delta":"继续"}', "responses", delta)).toBe(false);
    expect(emitProviderDelta('data: {"type":"response.completed"}', "responses", delta)).toBe(true);
    expect(() => emitProviderDelta("data: no-json", "responses", delta)).toThrow("格式异常");
    expect(() => emitProviderDelta('data: {"choices":[{"finish_reason":"length"}]}', "chat-completions", delta)).toThrow(expect.objectContaining({ code: "PROVIDER_OUTPUT_LIMIT" }));
    expect(() => emitProviderDelta('data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}', "responses", delta)).toThrow(expect.objectContaining({ code: "PROVIDER_OUTPUT_LIMIT" }));
  });
});
