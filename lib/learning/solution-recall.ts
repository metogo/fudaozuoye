import type { CheckItem, LearningSession } from "./types";

export function isConcreteRecallAnswer(answer: string): boolean {
  const value = answer.trim();
  if (value.length < 4 || /^(不知道|不懂|不会|没看懂|忘了|不清楚|随便|懂了|明白了)$/u.test(value)) return false;
  if (/^(?:答案|结果|所以)?\s*[A-Da-d]|^(?:答案|结果|所以)?\s*[-+]?\d+(?:\.\d+)?(?:\s*[a-zA-Z%°℃毫厘分米秒克千瓦焦帕牛摩尔]+)?$/u.test(value)) return false;
  return !/乱写|乱算|乱乘|瞎猜|随便猜/u.test(value);
}

export function matchesTrustedRecallReference(reference: string, answer: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase()
    .replace(/[`*_#$\\{}\s，。；、：:（）()\[\]]/g, "");
  const normalizedReference = normalize(reference);
  const candidates = [answer, answer.replace(/^[^：:\n]{0,30}[：:]/u, ""), ...answer.split(/[。；\n]/u)];
  return candidates.some((candidate) => {
    const normalized = normalize(candidate);
    return normalized.length >= 12 && normalizedReference.includes(normalized);
  });
}

export function solutionRecallCheck(session: LearningSession): CheckItem {
  if (session.solutionRecallCheck) return session.solutionRecallCheck;
  return createGroundedRecallCheck(session);
}

export function createGroundedRecallCheck(session: LearningSession, solution?: string): CheckItem {
  const root = session.nodes.find((node) => node.id === session.rootNodeId);
  if (!root) throw new Error("原题不存在");
  const source = solution || root.check.explanation;
  const lines = source.split(/\n+/).map((line) => line.trim()).filter((line) => line.length >= 15 && line.length <= 350 && !/^#{1,6}\s/.test(line));
  const score = (line: string) =>
    (/[=＝→]/.test(line) ? 6 : 0) +
    (/\d/.test(line) ? 3 : 0) +
    (/因为|因此|所以|代入|可得|得到|说明|证明|表明/.test(line) ? 2 : 0) -
    (/；$|以下|步骤如下|解题思路/.test(line) ? 4 : 0);
  const quote = [...lines].sort((a, b) => score(b) - score(a))[0] ?? source.slice(0, 250);
  return {
    id: `solution-recall-${root.id}-grounded`,
    conceptId: root.conceptId,
    type: "short_text",
    prompt: [
      `刚才讲解中的这一步：\n\n> ${quote}`,
      "这一步用了原题中的哪条条件或关系？用一句话说明为什么可以这样推。",
    ].join("\n\n"),
    answer: [
      `当前原题：${session.problem.text}`,
      `当前步骤：${quote}`,
      `完整解法依据：${source}`,
      `可接受的思路方向：${session.problemGuide.approach}`,
    ].join("\n"),
    explanation: "只要学生说出一个能回应问题、在当前题中可执行且方向正确的关键步骤即可；不要求复述整段讲解，也不要求最终答案。",
  };
}

export function parseGroundedRecallCheck(value: Record<string, unknown>, session: LearningSession, solution: string): CheckItem {
  const { sourceQuote, question, answer, explanation } = value;
  if ([sourceQuote, question, answer, explanation].some((part) => typeof part !== "string" || part.trim().length < 8)) throw new Error("关键步骤检查缺少具体问题或依据");
  const quote = (sourceQuote as string).trim();
  const prompt = (question as string).trim();
  if (!solution.includes(quote) || quote.length > 300 || prompt.length > 240 || (answer as string).length > 1200 || (explanation as string).length > 1200) throw new Error("关键步骤未对应刚才的讲解");
  if (/题目要求哪个量|哪条条件最接近|说清楚一个关键步骤|题目要解决什么/.test(prompt)) throw new Error("关键步骤问题不能使用通用套话");
  const check = createGroundedRecallCheck(session, solution);
  return { ...check, prompt: `刚才讲解中的这一步：\n\n> ${quote}\n\n${prompt}`, answer: `当前原题：${session.problem.text}\n当前步骤：${quote}\n参考解释：${answer}`, explanation: explanation as string };
}
