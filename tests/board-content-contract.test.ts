import { describe, expect, it } from "vitest";
import { assertEnhancedBoardContent, assertNativeMathBoardContent, enhancedBoardInstructionSignature } from "@/lib/learning/board-content-contract";
import { sortChronology } from "@/lib/learning/board-chronology";

describe("板书内容契约", () => {
  it("允许有题干依据的学科化学习动作，并生成稳定的指令签名", () => {
    expect(() => assertEnhancedBoardContent("math", "先根据已知条件建立数量关系，再检查单位。", "", "", "题目给出 12 米和 3 个小组")).not.toThrow();
    expect(enhancedBoardInstructionSignature("先完成第 2 步：建立关系。", "", "")).toBe("先完成第2步建立关系");
    expect(enhancedBoardInstructionSignature("原题依据：12米；再检查。", "", "12米")).toBe("再检查");
  });

  it.each([
    ["通用模板：跳过当前题。", "通用模板"],
    ["先根据条件判断，产量提高。", "事实断言"],
    ["先根据条件说明导致发展。", "结果性陈述"],
    ["先建立数量关系，再代入 99。", "数字事实"],
    ["这是完全陌生的结论。", "事实内容"],
    ["先阅读题干。", "学科的证据与推理动作"],
  ])("拒绝未被证据支持的增强板书正文：%s", (content, message) => {
    expect(() => assertEnhancedBoardContent("math", content, "", "", "题目给出 12 米")).toThrow(message);
  });

  it("原生数学板书要求五段、关系推进、复核与迁移", () => {
    const blocks = [
      { id: "block", label: "步骤", tone: "plain" as const, content: "已知 $a=1$，先建立关系。" },
      { id: "block", label: "步骤", tone: "plain" as const, content: "再得到 $b=2$。" },
      { id: "block", label: "步骤", tone: "plain" as const, content: "代入得 $a+b=3$。" },
      { id: "block", label: "步骤", tone: "plain" as const, content: "检查结果是否符合条件。" },
      { id: "block", label: "步骤", tone: "plain" as const, content: "换字母后重建同样关系。" },
    ];
    expect(() => assertNativeMathBoardContent(blocks, { relationExpressions: ["a=1", "b=2"], derivationExpressions: ["a+b=3"] })).not.toThrow();
    expect(() => assertNativeMathBoardContent(blocks.slice(0, 4), { relationExpressions: [], derivationExpressions: [] })).toThrow("五个推导动作");
    expect(() => assertNativeMathBoardContent([{ id: "block", label: "步骤", tone: "plain" as const, content: "重复" }, { id: "block", label: "步骤", tone: "plain" as const, content: "重复" }, ...blocks.slice(2)], { relationExpressions: [], derivationExpressions: [] })).toThrow("不能重复");
    expect(() => assertNativeMathBoardContent(blocks, { relationExpressions: ["c=3"], derivationExpressions: [] })).toThrow("建立题干关系");
    expect(() => assertNativeMathBoardContent(blocks, { relationExpressions: [], derivationExpressions: ["c=3"] })).toThrow("关系推进");
    expect(() => assertNativeMathBoardContent([...blocks.slice(0, 3), { id: "block", label: "步骤", tone: "plain" as const, content: "观察即可" }, { id: "block", label: "步骤", tone: "plain" as const, content: "结束" }], { relationExpressions: [], derivationExpressions: [] })).toThrow("复核或题型迁移");
  });

  it("按时间数值或朝代排序，无法比较时保持无排序结果", () => {
    expect(sortChronology([{ time: "2020年", id: "late" }, { time: "公元前 221年", id: "early" }, { time: "1世纪", id: "middle" }])?.map((item) => item.id)).toEqual(["early", "middle", "late"]);
    expect(sortChronology([{ time: "唐朝", id: "tang" }, { time: "秦朝", id: "qin" }, { time: "宋代", id: "song" }])?.map((item) => item.id)).toEqual(["qin", "tang", "song"]);
    expect(sortChronology([{ time: "唐朝" }, { time: "2020年" }])).toBeNull();
    expect(sortChronology([{ time: "未知" }])).toBeNull();
  });
});
