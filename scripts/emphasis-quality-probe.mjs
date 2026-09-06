import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { getProviderConfig } = require("../functions/learning-api/dist/lib/learning/providers/config.js");
const { LiveProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/adapter.js");
const { extractText } = require("../functions/learning-api/dist/lib/learning/providers/model-support.js");
const { analyzeMock, recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const quadratic = "已知关于x的一元二次方程x²−6x+k=0有两个实数根。(1)求k的范围；(2)若x₁²+x₂²=24，求k；(3)两根作直角边，求斜边。";
const samples = [
  { id: "根的范围", problem: quadratic, context: "只讲第一问求k范围", source: String.raw`**先找条件**：题目说明有两个实数根，因此第一步应判断方程是否有实数根，而不是直接套求根公式。

用根的判别式把这条条件转为 $\Delta\geq0$。这里包含相等的两个根，所以不能把大于等于改成严格大于。

然后对照题目找到二次项、一次项和常数项的系数，代入判别式，就能把根的条件转成参数的不等式。` },
  { id: "韦达转换", problem: quadratic, context: "只讲第二问，已经完成第一问", source: String.raw`第二问给出了两根的平方和，而韦达定理直接给出的是两根之和与两根之积。重点不在分别算出两根。

把已知量改写为 $x_1^2+x_2^2=(x_1+x_2)^2-2x_1x_2$，就能用两根之和与积来替换。

再将韦达定理提供的关系代入这个等式，得到只含参数的方程，求出后还需检验它是否满足第一问的范围。` },
  { id: "斜边不是判别式", problem: quadratic, context: "第三问，两根为正，前两问已完成", source: String.raw`前两问已经确定根存在并且能作为边长。现在问的是直角三角形斜边，不需要重新讨论判别式。

两根作为两条直角边，所以用勾股定理写出 $c^2=x_1^2+x_2^2=24$。第二问提供的平方和可以直接用上，不必分别求两条直角边。

最后开平方时只取正值，因为这里求的是长度。这个步骤的依据来自直角三角形的边长关系。` },
  { id: "物理匀速", subject: "physics", problem: "小车做匀速直线运动，3秒行驶6米，求5秒的路程。", context: "判断为什么可以先求速度", source: String.raw`**先判断运动特点**：题目中的匀速直线运动意味着速度大小不随时间变化，这是把前3秒的信息用于后5秒计算的前提。

先用 $v=\frac{s}{t}$ 从已知路程和时间求出速度，再用这个不变的速度求新的路程。如果运动不是匀速的，就不能直接沿用这个比例关系。

代入前还要检查路程和时间的单位，保持同一套单位后再计算。` },
  { id: "化学配平", subject: "chemistry", problem: "配平氢气与氧气反应生成水的化学方程式。", context: "讲解为什么只能调整系数", source: String.raw`配平不是改变物质，而是让反应前后每种元素的原子总数一致。先分别数清氢、氧两种元素。

调整时只能改变化学式前面的系数，不能修改化学式里的下标。下标变化会把原来的物质改成另一种物质，而这已经不是题目给定的反应。

先让氧原子数相等，再回过头检查氢原子数，最后将所有系数约成最简整数比。` },
  { id: "无重点可画", problem: quadratic, context: "收尾确认，不是新讲解", source: "这一段我们先讲到这里。你可以回看刚才的内容，也可以接着问哪里还没有理解。接下来按照页面上的按钮继续即可。" },
  { id: "不标错误示例", problem: "解不等式−4k≥−36。", context: "解释不等式为什么变号", source: String.raw`两边同除以负数时，不等号方向必须改变，这与除以正数的情况不同。

错误示例是 $k\geq9$，这忘记了除数的符号，不能当作结论。

正确结果应是 $k\leq9$。检验时可以代入一个小于9的数，确认它满足原不等式。` },
  { id: "不给矛盾讲解背书", problem: "一元二次方程x²−6x+k=0有两个不相等的实数根，求k范围。", context: "判断根的判别式条件", source: String.raw`题目要求两个不相等的实数根。我们可以把两个相等的实根也包括进来，所以判别式满足 $\Delta\geq0$ 即可。

随后对照系数代入求解，不需要考虑是否出现重根，保留等号就能覆盖题目所有要求。` },
];
const results = [];
for (const sample of samples.slice(Number(process.env.EMPHASIS_SAMPLE_START || 0), Number(process.env.EMPHASIS_SAMPLE_LIMIT || samples.length))) {
  let raw = "";
  const config = getProviderConfig("doubao", "light");
  const adapter = new LiveProviderAdapter(config, async (...args) => {
    const response = await fetch(...args);
    if (response.ok) raw = extractText(await response.clone().json(), config.protocol);
    return response;
  });
  if (adapter.mode !== "live") throw new Error("需要真实模型配置，不以mock替代质量检查");
  const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
  session.problem = { ...session.problem, text: sample.problem, subject: sample.subject ?? "math" };
  const start = Date.now();
  try {
    const marks = await adapter.selectEmphasis(session, sample.source, sample.context);
    results.push({ ...sample, raw, marks, milliseconds: Date.now() - start });
    console.log(JSON.stringify({ id: sample.id, raw, marks, milliseconds: Date.now() - start }));
  } catch (error) { results.push({ id: sample.id, error: error.name }); console.log(`${sample.id}: 可选标记请求未完成`); }
}
await mkdir("outputs/emphasis", { recursive: true });
await writeFile(`outputs/emphasis/quality${process.env.EMPHASIS_SAMPLE_START ? "-negative" : ""}-samples.json`, JSON.stringify(results, null, 2));
