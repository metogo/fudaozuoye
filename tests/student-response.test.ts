import { describe, expect, it, vi } from "vitest";
import { transcribeStudentResponse } from "@/lib/learning/providers/student-response";

describe("学生手写作答转写", () => {
  it("接受结构正确的首轮结果，并规范化文本", async () => {
    const request = vi.fn().mockResolvedValue('{"text":"  e\\u0301  ","confidence":0.92}');
    await expect(transcribeStudentResponse("请写答案", request)).resolves.toEqual({ text: "é", confidence: 0.92 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toContain("请写答案");
  });

  it("首轮格式异常时只进行一次纠正请求", async () => {
    const request = vi.fn().mockResolvedValueOnce("not json").mockResolvedValueOnce('{"text":"x=6","confidence":1}');
    await expect(transcribeStudentResponse("填写结果", request)).resolves.toEqual({ text: "x=6", confidence: 1 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toContain("唯一一次修复机会");
  });

  it.each([
    '{"text":"","confidence":0.5}',
    '{"text":"ok","confidence":-0.1}',
    '{"text":"ok","confidence":1.1}',
    '{"text":3,"confidence":0.5}',
  ])("拒绝无法可靠识别的响应 %s", async (raw) => {
    const request = vi.fn().mockResolvedValue(raw);
    await expect(transcribeStudentResponse("填写结果", request)).rejects.toMatchObject({ code: "PROVIDER_ERROR", retryable: true });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
