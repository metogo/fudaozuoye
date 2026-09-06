import { describe, expect, it } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import { RichLearningText } from "@/components/lazy-rich-learning-text";

describe("按需加载真实公式渲染器", () => {
  it("跨过真实异步边界仍完整呈现公式、正文和尾部状态", async () => {
    const stream = await renderToReadableStream(<RichLearningText text={"## 推导\n\n$x^2-6x+k=0$\n\n保留完整题意。"} trailing={<span>完成</span>}/>);
    await stream.allReady;
    const html = await new Response(stream).text();
    for (const content of ["推导", "katex", "保留完整题意", "完成"]) expect(html).toContain(content);
    expect(html).not.toContain("error");
  });
});
