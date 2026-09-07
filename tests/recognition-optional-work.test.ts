import { describe, expect, it, vi } from "vitest";
import { LiveProviderAdapter } from "@/lib/learning/providers/adapter";
import type { ProviderConfig } from "@/lib/learning/providers/config";
import { NonRepairableValidationError } from "@/lib/learning/providers/provider-validation";

const recognized = {
  recognized: true, failureReason: "", text: "两队合修360米的公路，6天修完，每天合修多少米？",
  subject: "math", gradeBand: "primary", confidence: 0.98,
  visualContext: { related: false, affectsSolving: false, summary: "", facts: [], confidence: 0.99 },
};

const image = "data:image/jpeg;base64,AA==";
const workCases = [
  { label: "省略字段", fields: {}, expected: "" },
  { label: "null", fields: { childWork: null }, expected: "" },
  { label: "空字符串", fields: { childWork: "" }, expected: "" },
  { label: "纯空白", fields: { childWork: " \n\t　" }, expected: "" },
  { label: "已有多行作答", fields: { childWork: " 360÷6=60\n答：每天60米。 " }, expected: "360÷6=60\n答：每天60米。" },
  { label: "文本零答案", fields: { childWork: "0" }, expected: "0" },
];

describe.each(["chat-completions", "responses"] as const)("%s 可选作答识别", protocol => {
  const config: ProviderConfig = { id: "doubao", label: "测试", apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol, mock: false };
  const response = (value: Record<string, unknown>) => {
    const content = JSON.stringify(value);
    return Response.json(protocol === "responses" ? { output_text: content } : { choices: [{ message: { content } }] });
  };

  it.each(workCases)("$label：一次识别即可准备讲题会话", async ({ fields, expected }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...recognized, ...fields }));
    const adapter = new LiveProviderAdapter(config, fetcher);
    const problem = await adapter.recognizeProblem(image);
    const session = await adapter.prepareChatSession(problem);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(session.problem.text).toBe(recognized.text);
    expect(session.problem.childWork).toBe(expected);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(JSON.stringify(body)).toContain("没有可辨认作答时输出空字符串");
    expect(JSON.stringify(body)).toContain(image);
  });

  it.each(workCases.slice(0, 3))("异常结构修复为$label：允许继续，不再追加识别", async ({ fields, expected }) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ ...recognized, childWork: ["360÷6=60"] }))
      .mockResolvedValueOnce(response({ ...recognized, ...fields }));
    const problem = await new LiveProviderAdapter(config, fetcher).recognizeProblem(image);
    expect(problem.childWork).toBe(expected);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const repair = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(JSON.stringify(repair)).toContain("学生已有作答格式不合法");
    expect(JSON.stringify(repair)).toContain(image);
    expect(repair.model).toBe(config.modelId);
  });

  it("修复得到的学生作答原文不能被丢弃", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ ...recognized, childWork: { answer: "60" } }))
      .mockResolvedValueOnce(response({ ...recognized, childWork: " 360÷6=60\n我认为每天60米。 " }));
    const result = await new LiveProviderAdapter(config, fetcher).recognizeProblem(image);
    expect(result.childWork).toBe("360÷6=60\n我认为每天60米。");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("修复后仍为异常格式时明确失败，不回退空作答、不无限重试", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ ...recognized, childWork: false }))
      .mockResolvedValueOnce(response({ ...recognized, childWork: 0 }));
    await expect(new LiveProviderAdapter(config, fetcher).recognizeProblem(image)).rejects.toThrow("学生已有作答格式不合法");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    { label: "未识别到题目", fields: { recognized: false, failureReason: "照片模糊" } },
    { label: "题干低置信度", fields: { confidence: 0.54 } },
  ])("$label：即使没有作答也不可放行或自动反复识别", async ({ fields }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...recognized, ...fields }));
    await expect(new LiveProviderAdapter(config, fetcher).recognizeProblem(image)).rejects.toThrow(NonRepairableValidationError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
