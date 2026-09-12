import { describe, expect, it, vi } from "vitest";
import { needsVisualReview, requiresProblemImage } from "@/lib/learning/problem-evidence";
import { parseMissingVisualInformation } from "@/lib/learning/problem-completeness";
import { LiveProviderAdapter } from "@/lib/learning/providers/adapter";
import { parseProblem } from "@/lib/learning/providers/provider-validation";
import type { ProviderConfig } from "@/lib/learning/providers/config";

const recognized = {
  recognized: true, text: "如图，在三角形ABC中，角ACB=90°，AC=BC=4，求AB。",
  childWork: "", subject: "math", gradeBand: "junior", confidence: 0.99,
  visualContext: { related: false, affectsSolving: false, summary: "", facts: [], confidence: 1 },
  missingVisualInformation: [],
};
const image = "data:image/png;base64,AA==";

describe("照片配图与题设完整性独立判断", () => {
  it.each(["如图", "见图", "下图", "图中", "根据图", "观察图"])("%s 不等于照片实际包含配图", keyword => {
    const problem = parseProblem({ ...recognized, text: recognized.text.replace("如图", keyword) });
    expect(problem.visualContext?.related).toBe(false);
    expect(needsVisualReview(problem)).toBe(false);
    expect(requiresProblemImage(problem)).toBe(false);
  });

  it("真实的相关图形仍保留可见证据并传入后续多模态讲解", () => {
    const fact = { text: "AB 标为4厘米", source: "printed_label", confidence: 0.99 };
    const problem = parseProblem({ ...recognized, visualContext: { related: true, affectsSolving: true, summary: "三角形边长标注", facts: [fact], confidence: 0.99 } });
    expect(requiresProblemImage(problem)).toBe(true);
    expect(problem.visualContext?.facts).toEqual([fact]);
  });

  it("确实缺图时保留题干和具体缺失条件，不生成虚假图形证据", () => {
    const problem = parseProblem({ ...recognized, text: "如图，求阴影部分的面积。", missingVisualInformation: [" 阴影区域的边界 ", "各边标注的长度", "阴影区域的边界"] });
    expect(problem.text).toBe("如图，求阴影部分的面积。");
    expect(problem.missingVisualInformation).toEqual(["阴影区域的边界", "各边标注的长度"]);
    expect(problem.visualContext?.facts).toEqual([]);
    expect(needsVisualReview(problem)).toBe(true);
  });

  it.each([null, false, "缺图", {}, [3], [""], ["  "], ["字".repeat(181)], Array(9).fill("条件")])("拒绝畸形缺失条件 %j", value => {
    expect(() => parseMissingVisualInformation(value)).toThrow("缺失图中条件的识别结果格式不合法");
  });

  it("旧会话没有新字段时不凭空生成缺失条件", () => {
    expect(parseMissingVisualInformation(undefined)).toEqual([]);
  });
});

describe.each(["chat-completions", "responses"] as const)("%s 识别链路", protocol => {
  const config: ProviderConfig = { id: "doubao", label: "测试", apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol, mock: false };
  const response = (value: unknown) => {
    const content = JSON.stringify(value);
    return Response.json(protocol === "responses" ? { output_text: content } : { choices: [{ message: { content } }] });
  };

  it("文字条件完整的截图一次识别即放行，不触发修复或确认", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(recognized));
    const adapter = new LiveProviderAdapter(config, fetcher);
    const problem = await adapter.recognizeProblem(image);
    expect((await adapter.prepareChatSession(problem)).problem.text).toBe(recognized.text);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = String(fetcher.mock.calls[0][1]?.body);
    expect(body).toContain(image);
    expect(body).toContain("missingVisualInformation");
    expect(body).toContain("不能凭这些词假定配图存在");
    expect(body).toContain("题干文字、公式、题号、文字列表、文本框和截图边框本身都不是配图");
    expect(body).toContain("题干句子中的数字和几何关系只保留在 text");
    expect(body).toContain("使用紧凑 JSON");
    expect(body).toContain("不得删字段、缩写题干、省略选项或改写学生作答");
  });

  it("缺少必要条件时识别成功，但准备和求解均禁止调用模型", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...recognized, missingVisualInformation: ["阴影区域的边界"] }));
    const adapter = new LiveProviderAdapter(config, fetcher);
    const problem = await adapter.recognizeProblem(image);
    expect(needsVisualReview(problem)).toBe(true);
    await expect(adapter.prepareChatSession(problem)).rejects.toThrow("阴影区域的边界");
    const complete = await adapter.prepareChatSession(parseProblem(recognized));
    await expect(adapter.completeChatSession({ ...complete, problem })).rejects.toThrow("阴影区域的边界");
    await expect(adapter.analyzeProblem(problem)).rejects.toThrow("阴影区域的边界");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("有图题复核使用明确必填结构，遗漏复核结果时携带原图和结构修复", async () => {
    const visualContext = { related: true, affectsSolving: true, summary: "长方形边长标注", confidence: 0.99,
      facts: [{ text: "长方形上边标注8厘米", source: "printed_label", confidence: 0.99 }] };
    const answer = { originalAnswer: "22厘米", originalExplanation: "长8厘米、宽3厘米，周长为两倍的长宽之和。" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(answer)).mockResolvedValueOnce(response({ ...answer, visualContext }));
    const adapter = new LiveProviderAdapter(config, fetcher);
    const pending = await adapter.prepareChatSession(parseProblem({ ...recognized, visualContext }));
    const completed = await adapter.completeChatSession(pending, image);
    expect(completed.problem.visualContext?.facts).toEqual(visualContext.facts);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, request] of fetcher.mock.calls) {
      const body = String(request?.body);
      expect(body).toContain(image);
      expect(body).toContain("outputSchema");
      expect(body).toContain("visualContext");
      expect(body).toContain("required");
    }
    expect(String(fetcher.mock.calls[1][1]?.body)).toContain("多模态分析缺少题图复核结果");
  });
});
