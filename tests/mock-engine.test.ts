import { describe, expect, it } from "vitest";
import { getConcept } from "@/lib/learning/curriculum";
import { analyzeMock, expandMock, nodeFromConcept, recognizeMock, solutionMock, transferCheckMock, verifyMock } from "@/lib/learning/mock-engine";
import { MockProviderAdapter } from "@/lib/learning/providers/adapter";
import { isSupportedSubjectBand } from "@/lib/learning/curriculum";
import { subjects, type GradeBand } from "@/lib/learning/types";

describe("Mock 学习引擎", () => {
  it.each([
    ["math", "primary"], ["math", "junior"], ["math", "senior"],
    ["physics", "junior"], ["physics", "senior"],
    ["chemistry", "junior"], ["chemistry", "senior"],
  ] as const)("覆盖 %s / %s 的完整初始分析", (subject, band) => {
    const problem = recognizeMock(subject, band);
    const session = analyzeMock(problem, "doubao");
    expect(session.problem.subject).toBe(subject);
    expect(session.nodes.length).toBeGreaterThanOrEqual(2);
    expect(session.edges.length).toBe(session.nodes.length - 1);
  });

  it("原子点不会被继续拆解", () => {
    const session = analyzeMock(recognizeMock("chemistry", "junior"), "doubao");
    const atomic = session.nodes.find((node) => node.conceptId === "chemistry.equation.conservation")!;
    expect(atomic.atomic).toBe(true);
    expect(() => expandMock(session, atomic.id)).toThrow(/最小概念/);
  });

  it("微型题使用标准答案进行明确验收", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const multiplication = session.nodes.find((node) => node.conceptId === "math.arithmetic.multiplication")!;
    expect(verifyMock(multiplication.check, "48").passed).toBe(true);
    expect(verifyMock(multiplication.check, "16").passed).toBe(false);
    expect(verifyMock(multiplication.check, "4").passed).toBe(false);
    expect(verifyMock(multiplication.check, "").passed).toBe(false);
  });

  it("高中数学迁移题仍检验二次函数", () => {
    const check = transferCheckMock("math", "senior");
    expect(check.conceptId).toBe("math.function.quadratic");
    expect(check.prompt).toContain("二次函数");
  });

  it("迁移题改变情境但保留同一验收机制", () => {
    const check = transferCheckMock("physics", "junior");
    expect(check.prompt).toContain("72");
    expect(verifyMock(check, "12 m/s").passed).toBe(true);
  });

  it.each([
    ["biology", "实验组只改变温度，对照组温度不同，其他条件保持一致并观察萌发率"],
    ["chinese", "原文‘拿起又放下、走到门口又退回’用反复动作表现人物犹豫"],
    ["english", "The phrase ‘I stayed’ is the text evidence and shows the decision changed."],
    ["history", "材料事实是1898年改革措施开始推行，这属于改革过程而不是后续影响"],
    ["geography", "该区域位于山脉迎风坡，湿润海风受地形抬升形成较多降水"],
    ["politics", "材料中增设无障碍通道，体现依法保障公民平等参与社会生活的权利"],
  ] as const)("%s 开放题能接受有材料、有推理的等价表达", (subject, answer) => {
    const check = transferCheckMock(subject, "junior");
    expect(check.prompt).toMatch(/材料|Read:|探究/);
    expect(verifyMock(check, answer).passed).toBe(true);
    expect(verifyMock(check, "我不知道").passed).toBe(false);
  });

  it("演示模式拒绝用固定答案伪装处理任意自定义题", async () => {
    const adapter = new MockProviderAdapter("doubao");
    await expect(adapter.recognizeProblem("data:image/png;base64,iVBORw0KGgo="))
      .rejects.toThrow("演示模式只支持内置代表题");
    await expect(adapter.recognizeTextProblem("这是一道历史题：请分析一项未收录改革的影响。"))
      .rejects.toThrow("只支持内置代表题");
    const custom = { ...recognizeMock("math", "junior"), text: "解方程 x+1=2。", userRevised: true };
    await expect(adapter.prepareChatSession(custom)).rejects.toThrow("只支持内置代表题");
  });

  it("全部内置代表题都能从文字入口精确回到原学科和学段", async () => {
    const adapter = new MockProviderAdapter("doubao");
    const bands: GradeBand[] = ["primary", "junior", "senior"];
    for (const subject of subjects) for (const band of bands) {
      if (!isSupportedSubjectBand(subject, band)) continue;
      const sample = recognizeMock(subject, band);
      const recognized = await adapter.recognizeTextProblem(sample.text);
      expect([recognized.subject, recognized.gradeBand], `${subject}/${band}`).toEqual([subject, band]);
      const punctuationVariant = await adapter.recognizeTextProblem(`${sample.text.replace(/[。.!?？]$/, "")}！`);
      expect([punctuationVariant.subject, punctuationVariant.gradeBand], `${subject}/${band}/punctuation`).toEqual([subject, band]);
    }
  });

  it("每个内置题的完整讲解都对应当前样例并包含四段完整结构", () => {
    const bands: GradeBand[] = ["primary", "junior", "senior"];
    for (const subject of subjects) for (const band of bands) {
      if (!isSupportedSubjectBand(subject, band)) continue;
      const problem = recognizeMock(subject, band);
      const solution = solutionMock(problem);
      const session = analyzeMock(problem, "doubao");
      for (const heading of ["### 解题思路", "### 分步推导", "### 结论", "### 易错提醒"]) expect(solution, `${subject}/${band}`).toContain(heading);
      expect(solution, `${subject}/${band}`).toContain(session.nodes.find((node) => node.id === session.rootNodeId)?.check.answer ?? "__missing__");
      expect((solution.match(/^\d+\. /gm) ?? []).length, `${subject}/${band}/steps`).toBeGreaterThanOrEqual(3);
    }
  });

  it("开放题拒绝带学科关键词但明确否定正确关系的答案", () => {
    const wrong = {
      biology: "光照实验需要对照两组，但其他条件全部不同并保持随机",
      chinese: "原文证据完全无关，所以没有任何作用",
      english: "Although is not concession; the text evidence shows the match stopped.",
      history: "材料事实表明改革没有背景，也没有任何影响变化",
      geography: "区域地形与气候没有联系，也不会形成降水差异",
      politics: "材料中的权利与义务不体现任何观点或意义",
    } as const;
    for (const subject of Object.keys(wrong) as Array<keyof typeof wrong>) expect(verifyMock(transferCheckMock(subject, "junior"), wrong[subject]).passed, subject).toBe(false);
  });

  it("答案判定拒绝数值和关键关系前的明确否定，但接受自然等价表达", () => {
    const numericSession = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const numeric = numericSession.nodes.find((node) => node.id === numericSession.rootNodeId)!.check;
    expect(verifyMock(numeric, "答案不是8").passed).toBe(false);
    expect(verifyMock(numeric, "所以 x=8").passed).toBe(true);

    expect(verifyMock(transferCheckMock("biology", "junior"), "设置温度不同的两组作为对照，水分、种子和时间均保持一致，观察萌发率").passed).toBe(true);
    expect(verifyMock(transferCheckMock("biology", "junior"), "设置两组并观察萌发率，但水分和时间未保持一致").passed).toBe(false);
    expect(verifyMock(transferCheckMock("politics", "junior"), "增设无障碍通道保障公民平等参与社会生活，体现法律保护公民权利").passed).toBe(true);
    expect(verifyMock(transferCheckMock("politics", "junior"), "增设无障碍通道，但这并不体现权利保护或社会意义").passed).toBe(false);
    expect(verifyMock(transferCheckMock("english", "primary"), "Tom gets up at seven.").passed).toBe(true);
    expect(verifyMock(transferCheckMock("english", "senior"), "Although hardly shows concession here.").passed).toBe(false);
    expect(verifyMock(transferCheckMock("english", "senior"), "Although fails to introduce concession in this sentence.").passed).toBe(false);
    expect(verifyMock(transferCheckMock("politics", "junior"), "材料提到无障碍通道，但这种说法有误。").passed).toBe(false);
    expect(verifyMock(transferCheckMock("geography", "junior"), "迎风坡和湿润海风都出现了，但这种解释站不住脚。").passed).toBe(false);
    const english = analyzeMock(recognizeMock("english", "primary"), "doubao");
    expect(verifyMock(english.nodes.find((node) => node.id === english.rootNodeId)!.check, "Tom never gets up at seven").passed).toBe(false);
    expect(verifyMock(english.nodes.find((node) => node.id === english.rootNodeId)!.check, "Tom should never, under any circumstances, be described as getting up at seven.").passed).toBe(false);
    const biology = analyzeMock(recognizeMock("biology", "senior"), "doubao");
    const biologyCheck = biology.nodes.find((node) => node.id === biology.rootNodeId)!.check;
    expect(verifyMock(biologyCheck, "胰岛素不会促进细胞摄取葡萄糖和降低血糖，不过经过很多无关描述以后这属于负反馈并恢复稳态").passed).toBe(false);
  });

  it("代表题完整讲解写出本题真实中间过程，不再只是三句通用模板", () => {
    expect(solutionMock(recognizeMock("chemistry", "junior"))).toContain("先在 $\\mathrm{H_2O}$ 前写 2");
    expect(solutionMock(recognizeMock("math", "junior"))).toContain("等式两边同除以 3");
    expect(solutionMock(recognizeMock("geography", "senior"))).toContain("东坡");
    expect(solutionMock(recognizeMock("history", "senior"))).toContain("甲的变化落在教育领域");
  });

  it("高中生物原题接受血糖负反馈答案，完整讲解不再串到光照实验", () => {
    const problem = recognizeMock("biology", "senior");
    const session = analyzeMock(problem, "doubao");
    const check = session.nodes.find((node) => node.id === session.rootNodeId)!.check;
    expect(verifyMock(check, "血糖升高后胰岛素分泌增加，促进细胞摄取葡萄糖并合成糖原，使血糖下降，通过负反馈恢复稳态").passed).toBe(true);
    expect(solutionMock(problem)).toContain("血糖");
    expect(solutionMock(problem)).not.toContain("有光与无光");
  });

  it("目录中的非原子点都声明直接前置", () => {
    const ids = ["math.rate.unit-rate", "math.ratio.proportional", "physics.motion.speed", "chemistry.equation.balance"];
    ids.forEach((id) => expect(getConcept(id)?.prerequisites.length).toBeGreaterThan(0));
  });

  it("演示入口可到达的每个概念都有应用型检查题", () => {
    const reachable = new Set<string>();
    const visit = (conceptId: string) => {
      if (reachable.has(conceptId)) return;
      reachable.add(conceptId);
      getConcept(conceptId)?.prerequisites.forEach(visit);
    };
    (["math", "physics", "chemistry"] as const).forEach((subject) => {
      (["primary", "junior", "senior"] as const).forEach((band) => {
        if (subject !== "math" && band === "primary") return;
        analyzeMock(recognizeMock(subject, band), "doubao").nodes.filter((node) => node.kind === "concept").forEach((node) => visit(node.conceptId));
      });
    });
    expect(reachable.size).toBeGreaterThanOrEqual(30);
    reachable.forEach((conceptId) => {
      const node = nodeFromConcept(conceptId);
      expect(node.check.prompt).not.toBe("");
      expect(node.check.answer).not.toBe("");
      expect(node.check.prompt).not.toContain("对应下面哪个知识点");
    });
  });
});
