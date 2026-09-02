"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeFromConcept = nodeFromConcept;
exports.recognizeMock = recognizeMock;
exports.isBuiltInMockProblem = isBuiltInMockProblem;
exports.analyzeMock = analyzeMock;
exports.expandMock = expandMock;
exports.verifyMock = verifyMock;
exports.transferCheckMock = transferCheckMock;
exports.similarCheckMock = similarCheckMock;
exports.solutionMock = solutionMock;
const curriculum_1 = require("./curriculum");
const mock_sample_content_1 = require("./mock-sample-content");
const assessment_1 = require("./providers/assessment");
const graph_1 = require("./graph");
const flow_1 = require("./flow");
const samples = {
    math: {
        primary: { text: "一辆车 3 小时行驶 180 千米，照这样的速度，5 小时行驶多少千米？", childWork: "180÷5×3=108（我在这里卡住了）" },
        junior: { text: "解方程：3(x-2)=18。", childWork: "3x-2=18，接下来不会了" },
        senior: { text: "已知二次函数 y=x²-4x+3，求它的顶点坐标。", childWork: "不知道怎样配方" },
    },
    physics: {
        primary: { text: "小车 5 秒行驶 50 米，平均每秒行驶多少米？", childWork: "50×5=250" },
        junior: { text: "汽车 5 秒内匀速行驶 50 米，它的速度是多少？", childWork: "不会确定公式和单位" },
        senior: { text: "质量为 2 kg 的物体受到 10 N 合力，加速度是多少？", childWork: "写出了 F=ma，但不会代入" },
    },
    chemistry: {
        primary: { text: "写出水由哪些元素组成。", childWork: "不认识元素符号" },
        junior: { text: "配平化学方程式：H₂ + O₂ → H₂O。", childWork: "H₂ + O₂ → 2H₂O" },
        senior: { text: "1 mol O₂ 含有多少个氧分子？", childWork: "不知道物质的量和粒子数关系" },
    },
    biology: {
        primary: { text: "探究光照是否影响植物生长，应怎样设置对照？", childWork: "不知道要控制什么" },
        junior: { text: "探究光照是否影响植物生长，应怎样设置对照实验？", childWork: "没有区分变量" },
        senior: { text: "分析血糖升高后机体如何通过反馈调节恢复稳态。", childWork: "只记住激素名称" },
    },
    chinese: {
        primary: { text: "阅读短文：‘线团滚进门后，小猫立刻绕到门后，轻轻一跃叼住了线团。’找出表现小猫机灵的一句话，并说明理由。", childWork: "只写了‘很可爱’" },
        junior: { text: "阅读材料，赏析‘风把树叶一页页翻过’的表达效果。", childWork: "只写了用了拟人" },
        senior: { text: "原文前文写‘我虽然害怕，还是迈出了第一步’，结尾写‘我终于懂得，真正的勇敢是带着害怕仍向前走。’分析结尾段在内容和结构上的作用。", childWork: "没有引用原文" },
    },
    english: {
        primary: { text: "Read: Tom gets up at seven. What time does Tom get up?", childWork: "I chose ten." },
        junior: { text: "Read: Lucy planned to walk home. The rain became heavier, so she decided to take the bus. Find the sentence showing why Lucy changed her plan.", childWork: "I guessed without evidence." },
        senior: { text: "Analyze the clause relationship in: Although it rained, the match continued.", childWork: "I cannot identify the connector." },
    },
    history: {
        primary: { text: "材料：1898年改革措施开始推行，此后新式学堂开始设立。指出改革发生的时间并概括一项影响。", childWork: "没有引用材料" },
        junior: { text: "材料：改革前旧赋税征收标准不一、重复负担严重；改革后统一征收标准。概括改革背景并分析影响。", childWork: "把背景和影响混在一起" },
        senior: { text: "史料甲：旧教育制度难适应新形势，改革后新式学堂增多。史料乙：旧赋税制度负担重复，改革后征收标准统一。比较两次改革的共同背景与不同影响。", childWork: "只复述材料" },
    },
    geography: {
        primary: { text: "地图图例显示该地位于秦岭—淮河以南、年降水量800毫米以上。判断该地位于我国哪个区域。", childWork: "没有看图例" },
        junior: { text: "某地夏季高温多雨、冬季寒冷干燥，分析影响其气候的主要因素。", childWork: "只抄气候特点" },
        senior: { text: "材料：湿润气流自东向西越过山地，东坡为迎风坡，西坡为背风坡。解释该区域降水的空间差异。", childWork: "没有建立过程关系" },
    },
    politics: {
        primary: { text: "材料：同学们按顺序排队进入图书馆，不追逐打闹。说明遵守公共规则的意义。", childWork: "只写了应该遵守" },
        junior: { text: "材料：学校无故拒绝学生入学，学生依法申诉并恢复入学。说明这体现了什么观点。", childWork: "只抄了材料" },
        senior: { text: "材料：某地保留传统工艺的核心技法，同时用新材料改进产品。运用矛盾分析法说明如何看待传统与创新。", childWork: "观点没有对应材料" },
    },
};
const checkBank = {
    "math.number.counting": { prompt: "6 和 4 中，哪个数更大？", type: "choice", choices: ["4", "6"], answer: "6", explanation: "数轴上越靠右的数越大。" },
    "math.arithmetic.addition": { prompt: "3 个苹果再添 4 个，一共有几个？", type: "choice", choices: ["7", "12", "1"], answer: "7", explanation: "把两部分合在一起，用加法。" },
    "math.arithmetic.multiplication": { prompt: "每盒 12 支笔，4 盒共有多少支？", type: "choice", choices: ["16", "48", "3"], answer: "48", explanation: "4 个 12 相加，12×4=48。" },
    "math.arithmetic.division": { prompt: "20 颗糖平均分给 5 人，每人几颗？", type: "choice", choices: ["4", "15", "100"], answer: "4", explanation: "求每份是多少，用总数除以份数。" },
    "math.rate.unit-rate": { prompt: "2 小时行驶 120 千米，每小时行驶多少千米？", type: "choice", choices: ["60", "122", "240"], answer: "60", explanation: "单位量=总量÷份数，120÷2=60。" },
    "math.ratio.proportional": { prompt: "每小时 60 千米，4 小时行驶多少千米？", type: "choice", choices: ["15", "64", "240"], answer: "240", explanation: "速度不变时，路程随时间同倍变化。" },
    "math.algebra.variable": { prompt: "一个数记作 x，它的 3 倍应写成什么？", type: "choice", choices: ["x+3", "3x", "x÷3"], answer: "3x", explanation: "3 个 x 相加简写为 3x。" },
    "math.algebra.equality": { prompt: "等式 8=8 的两边同时减 3，结果是什么？", type: "choice", choices: ["5=5", "5=8", "8=5"], answer: "5=5", explanation: "等号表示两边相等，同做相同变化仍相等。" },
    "math.algebra.equivalent-transform": { prompt: "x+4=9，两边同时减 4 后得到什么？", type: "choice", choices: ["x=5", "x=13", "x=4"], answer: "x=5", explanation: "等式两边同减一个数，等式仍成立。" },
    "math.arithmetic.order": { prompt: "计算 2×(3+1) 时应先算哪一步？", type: "choice", choices: ["3+1", "2×3", "2×1"], answer: "3+1", explanation: "混合运算中先计算括号内。" },
    "math.algebra.expression": { prompt: "比 x 的 2 倍多 3，应写成什么？", type: "choice", choices: ["2x+3", "2(x+3)", "x+6"], answer: "2x+3", explanation: "先用 2x 表示 x 的 2 倍，再加 3。" },
    "math.power.meaning": { prompt: "3² 表示什么？", type: "choice", choices: ["3×3", "3×2", "3+3"], answer: "3×3", explanation: "平方表示两个相同因数相乘。" },
    "math.algebra.quadratic-expression": { prompt: "x²-6x 配成完全平方时，括号里应是哪个式子？", type: "choice", choices: ["x-3", "x-6", "x+3"], answer: "x-3", explanation: "一次项系数的一半是 -3，因此先写 (x-3)²。" },
    "math.coordinate.axis": { prompt: "点 (2,-1) 的横坐标是多少？", type: "choice", choices: ["2", "-1", "1"], answer: "2", explanation: "有序数对中的第一个数是横坐标。" },
    "math.algebra.linear-equation": { prompt: "x+5=9，x 等于多少？", type: "choice", choices: ["4", "5", "14"], answer: "4", explanation: "等式两边同时减 5。" },
    "math.function.quadratic": { prompt: "x²-4x 配方后应包含哪一项？", type: "choice", choices: ["(x-2)²-4", "(x-4)²", "x(x-4)+4"], answer: "(x-2)²-4", explanation: "先取一次项系数一半，再平方。" },
    "physics.measure.unit": { prompt: "50 米用符号怎样写？", type: "choice", choices: ["50 m", "50 s", "50 kg"], answer: "50 m", explanation: "长度的国际单位是米，符号 m。" },
    "physics.motion.speed": { prompt: "40 米用时 4 秒，速度是多少？", type: "choice", choices: ["10 m/s", "44 m/s", "160 m/s"], answer: "10 m/s", explanation: "速度=路程÷时间。" },
    "physics.motion.reference": { prompt: "判断汽车是否运动，必须先明确什么？", type: "choice", choices: ["参照物", "汽车颜色", "天气"], answer: "参照物", explanation: "物体位置是否变化要相对于参照物判断。" },
    "physics.motion.distance-time": { prompt: "小车从 0 米位置走到 30 米位置，路程是多少？", type: "choice", choices: ["30米", "0米", "60米"], answer: "30米", explanation: "这段直线运动经过的路径长度是 30 米。" },
    "physics.measure.conversion": { prompt: "2 分钟等于多少秒？", type: "choice", choices: ["120秒", "20秒", "200秒"], answer: "120秒", explanation: "1 分钟等于 60 秒。" },
    "physics.motion.acceleration": { prompt: "速度每秒增加 2 m/s，加速度是多少？", type: "choice", choices: ["2 m/s²", "2 m/s", "0.5 m/s²"], answer: "2 m/s²", explanation: "加速度表示单位时间内速度的变化量。" },
    "physics.matter.mass": { prompt: "表示物体所含物质多少的物理量是什么？", type: "choice", choices: ["质量", "速度", "压强"], answer: "质量", explanation: "质量描述物体所含物质的多少。" },
    "physics.force.vector": { prompt: "描述一个力至少要关注什么？", type: "choice", choices: ["大小和方向", "颜色", "温度"], answer: "大小和方向", explanation: "力既有大小也有方向。" },
    "physics.force.balance": { prompt: "静止物体受到的一对平衡力，合力是多少？", type: "choice", choices: ["0 N", "1 N", "无法判断"], answer: "0 N", explanation: "平衡力大小相等、方向相反。" },
    "physics.newton.second-law": { prompt: "合力 12 N、质量 3 kg，加速度是多少？", type: "choice", choices: ["4 m/s²", "9 m/s²", "36 m/s²"], answer: "4 m/s²", explanation: "a=F÷m=12÷3。" },
    "chemistry.symbol.element": { prompt: "氧元素的符号是什么？", type: "choice", choices: ["O", "H", "C"], answer: "O", explanation: "氧元素符号为大写字母 O。" },
    "chemistry.formula.valence": { prompt: "水的化学式是什么？", type: "choice", choices: ["H₂O", "HO₂", "H₂O₂"], answer: "H₂O", explanation: "氢通常显 +1 价，氧显 -2 价。" },
    "chemistry.particle.atom": { prompt: "化学变化中的最小粒子通常是什么？", type: "choice", choices: ["原子", "烧杯", "温度"], answer: "原子", explanation: "化学反应中原子重新组合，原子种类不变。" },
    "chemistry.particle.molecule-ion": { prompt: "O₂ 中的‘2’表示一个氧分子含几个氧原子？", type: "choice", choices: ["2个", "1个", "4个"], answer: "2个", explanation: "化学式右下角数字表示一个分子中的原子个数。" },
    "chemistry.formula.meaning": { prompt: "CO₂ 表示一个二氧化碳分子含几个氧原子？", type: "choice", choices: ["2个", "1个", "3个"], answer: "2个", explanation: "元素符号右下角数字表示该元素的原子个数。" },
    "chemistry.formula.write": { prompt: "一个水分子的化学式应写成什么？", type: "choice", choices: ["H₂O", "H₂+O", "HO₂"], answer: "H₂O", explanation: "化学式用元素符号和右下角数字表示组成。" },
    "chemistry.equation.conservation": { prompt: "反应前后，哪一项一定不变？", type: "choice", choices: ["原子种类和数目", "分子种类", "物质颜色"], answer: "原子种类和数目", explanation: "化学反应重新组合原子，不创造或消灭原子。" },
    "chemistry.equation.balance": { prompt: "H₂ + O₂ → H₂O 中，H₂O 前的正确系数是？", type: "choice", choices: ["1", "2", "3"], answer: "2", explanation: "先令产物含 2 个氧原子，再平衡氢原子。" },
    "chemistry.mole.amount": { prompt: "1 mol 任意微粒包含的微粒数约为？", type: "choice", choices: ["6.02×10²³", "100", "22.4"], answer: "6.02×10²³", explanation: "1 mol 对应阿伏加德罗常数个微粒。" },
    "biology.experiment.variable": { prompt: "对照实验中除研究因素外，其他条件应怎样？", type: "choice", choices: ["保持一致", "全部改变", "任意设置"], answer: "保持一致", explanation: "单一变量才能把结果变化归因于研究因素。" },
    "biology.structure.function": { prompt: "分析生物结构时应进一步追问什么？", type: "choice", choices: ["它怎样支持功能", "它是什么颜色", "名称有几个字"], answer: "它怎样支持功能", explanation: "结构和功能需要建立可解释的对应关系。" },
    "biology.homeostasis.regulation": { prompt: "稳态受到扰动后，分析调节过程应优先寻找什么？", type: "choice", choices: ["反馈环节", "器官颜色", "题目字数"], answer: "反馈环节", explanation: "稳态调节要追踪变化、检测、调节与结果之间的反馈。" },
    "chinese.reading.evidence": { prompt: "阅读题下结论前最先做什么？", type: "choice", choices: ["定位原文依据", "凭印象概括", "抄写题目"], answer: "定位原文依据", explanation: "解释必须由原文信息支撑。" },
    "chinese.language.expression": { prompt: "赏析词句时只写修辞名称够吗？", type: "choice", choices: ["不够，还要结合语境说明作用", "够", "只需翻译"], answer: "不够，还要结合语境说明作用", explanation: "表达效果来自具体语境、对象和作用。" },
    "chinese.structure.purpose": { prompt: "分析结尾段作用时，哪种做法更完整？", type: "choice", choices: ["同时联系内容、前文和主旨", "只写总结全文", "只数段落"], answer: "同时联系内容、前文和主旨", explanation: "结构作用必须落到具体位置、照应关系和内容作用。" },
    "english.reading.evidence": { prompt: "A reading answer should first be supported by what?", type: "choice", choices: ["Textual evidence", "A random guess", "The title only"], answer: "Textual evidence", explanation: "The claim must be grounded in the passage." },
    "english.sentence.roles": { prompt: "In ‘Birds fly’, what is the subject?", type: "choice", choices: ["Birds", "fly", "Both"], answer: "Birds", explanation: "Birds performs the action and is the subject." },
    "english.grammar.relation": { prompt: "What relation does ‘although’ usually introduce?", type: "choice", choices: ["Concession", "Addition", "Sequence"], answer: "Concession", explanation: "Although marks a concessive relation between clauses." },
    "history.material.fact": { prompt: "材料题分析前应先区分什么？", type: "choice", choices: ["材料事实与自己的判断", "字体大小", "段落长短"], answer: "材料事实与自己的判断", explanation: "史料事实是因果与评价的证据起点。" },
    "history.time.space": { prompt: "理解历史事件首先要放入什么坐标？", type: "choice", choices: ["时间与空间", "答案序号", "字数"], answer: "时间与空间", explanation: "时空定位决定背景和联系。" },
    "history.cause.effect": { prompt: "判断历史因果时，哪项要求最重要？", type: "choice", choices: ["每条因果都有史料事实支撑", "只按时间先后", "只看结论长短"], answer: "每条因果都有史料事实支撑", explanation: "先后关系不自动等于因果，必须有材料依据。" },
    "history.comparison": { prompt: "比较两次改革时应怎样设置比较项？", type: "choice", choices: ["使用同一维度", "各写各的", "只比名称"], answer: "使用同一维度", explanation: "同口径比较才能形成有效异同判断。" },
    "geography.region.location": { prompt: "区域分析的第一步通常是什么？", type: "choice", choices: ["定位区域", "直接背结论", "忽略图例"], answer: "定位区域", explanation: "位置决定后续可讨论的自然与人文条件。" },
    "geography.factor.extract": { prompt: "解释区域差异时应提取哪些要素？", type: "choice", choices: ["自然与人文要素", "题号", "字体"], answer: "自然与人文要素", explanation: "地理结论由区域要素及其联系支撑。" },
    "geography.process.mechanism": { prompt: "解释地理现象时，哪种表达更完整？", type: "choice", choices: ["条件—作用过程—结果", "只写相关", "只报地名"], answer: "条件—作用过程—结果", explanation: "形成机制需要中间作用过程，不能把相关直接写成因果。" },
    "politics.question.direction": { prompt: "材料题动笔前先判断什么？", type: "choice", choices: ["设问要求", "材料字数", "答案行数"], answer: "设问要求", explanation: "设问限定知识范围和作答动作。" },
    "politics.material.layer": { prompt: "材料很长时应怎样处理？", type: "choice", choices: ["按意思分层并提关键词", "全文照抄", "只看最后一句"], answer: "按意思分层并提关键词", explanation: "分层后才能把材料信息和概念逐一对应。" },
    "politics.concept.match": { prompt: "材料与概念匹配时应满足什么？", type: "choice", choices: ["每个观点对应具体材料信息", "堆砌术语", "只写观点"], answer: "每个观点对应具体材料信息", explanation: "概念必须能够解释材料中的具体行为或结果。" },
    "politics.argument.expression": { prompt: "规范论证的一点通常包含什么？", type: "choice", choices: ["材料事实、观点和结论", "口号", "只有材料摘抄"], answer: "材料事实、观点和结论", explanation: "三者形成可检查的论证链。" },
};
const directConcepts = {
    math: {
        primary: ["math.rate.unit-rate", "math.arithmetic.multiplication"],
        junior: ["math.algebra.linear-equation", "math.arithmetic.multiplication"],
        senior: ["math.function.quadratic", "math.algebra.linear-equation"],
    },
    physics: {
        primary: ["physics.measure.unit"],
        junior: ["physics.motion.speed", "physics.measure.unit"],
        senior: ["physics.newton.second-law", "physics.force.vector"],
    },
    chemistry: {
        primary: ["chemistry.symbol.element"],
        junior: ["chemistry.equation.balance", "chemistry.equation.conservation"],
        senior: ["chemistry.mole.amount", "chemistry.symbol.element"],
    },
    biology: { primary: ["biology.experiment.variable"], junior: ["biology.experiment.variable", "biology.structure.function"], senior: ["biology.homeostasis.regulation", "biology.structure.function"] },
    chinese: { primary: ["chinese.reading.evidence"], junior: ["chinese.reading.evidence", "chinese.language.expression"], senior: ["chinese.structure.purpose", "chinese.reading.evidence"] },
    english: { primary: ["english.reading.evidence"], junior: ["english.reading.evidence", "english.sentence.roles"], senior: ["english.grammar.relation", "english.sentence.roles"] },
    history: { primary: ["history.material.fact"], junior: ["history.cause.effect", "history.material.fact"], senior: ["history.comparison", "history.cause.effect"] },
    geography: { primary: ["geography.region.location"], junior: ["geography.process.mechanism", "geography.factor.extract"], senior: ["geography.process.mechanism", "geography.factor.extract"] },
    politics: { primary: ["politics.question.direction"], junior: ["politics.concept.match", "politics.material.layer"], senior: ["politics.argument.expression", "politics.concept.match"] },
};
function uid(prefix) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
function teachingFor(title) {
    return {
        explanation: `${title}不是要背一句定义，而是先确认“已知什么、每一步改变了什么”。先用自己的话复述，再进入计算。`,
        example: `先换成一个数字更小、关系相同的例子，只保留“${title}”这一件事。`,
        parentPrompt: `你先不要算，告诉我这一步为什么需要用到“${title}”？`,
        expectedSignal: "你能指出量之间的关系，并独立说出下一步。",
        misconception: "只记住刚才的数字或步骤，却说不出为什么这样做。",
        alternateExplanation: `把题目中的数字遮住，用实物、箭头或一句日常语言重新解释“${title}”。`,
    };
}
function nodeFromConcept(conceptId) {
    const concept = (0, curriculum_1.getConcept)(conceptId);
    if (!concept)
        throw new Error(`课程目录中不存在知识点：${conceptId}`);
    const check = checkBank[conceptId];
    if (!check)
        throw new Error(`演示模式尚未配置“${concept.title}”的应用型检查题`);
    return {
        id: uid("node"), conceptId, title: concept.title, kind: "concept", difficulty: concept.difficulty,
        atomic: concept.atomic, curriculumVersion: concept.version, simplification: `先把“${concept.title}”单独拿出来，降低同时处理的信息量。`,
        state: "unchecked", attempts: 0, teaching: teachingFor(concept.title), check: { ...check, id: uid("check") },
    };
}
function originalCheck(problem) {
    return { id: uid("original"), conceptId: `problem.${problem.subject}.${problem.gradeBand}`, type: "short_text", ...(0, mock_sample_content_1.originalCheckContent)(problem) };
}
function problemGuideMock(problem) {
    const guides = {
        math: {
            goal: "这道题要先看清数量或图形之间的关系，再求题目最后问的量。",
            keyClue: `先圈出题干里的已知条件：“${problem.text.slice(0, 42)}${problem.text.length > 42 ? "…" : ""}”`,
            approach: "不要急着算。先说清哪些量有直接关系，再选一个能由已知推出未知的关系式。",
            firstQuestion: "题目最后要找什么？哪两个已知条件和它最接近？",
        },
        physics: {
            goal: "这道题要从物理情境中找出已知量和待求量，再选择对应关系。",
            keyClue: "先把题干中的物理量、数值和单位分别标出来，图中的方向也算条件。",
            approach: "先判断现象对应哪个物理关系，再写关系式；暂时不要代数字。",
            firstQuestion: "题目给了哪些物理量，最后要求哪个量？",
        },
        chemistry: {
            goal: "这道题要先判断物质或粒子之间发生了什么变化，再处理符号和数量关系。",
            keyClue: "先找反应物、生成物、化学式和题干给出的数量条件。",
            approach: "先用守恒关系把变化前后连起来，再决定是否需要配平或换算。",
            firstQuestion: "变化前后，哪一种粒子或元素的数量必须保持对应？",
        },
        biology: { goal: "从生命现象中建立结构、功能、过程和变量之间的联系。", keyClue: "圈出研究对象、条件变化和观察结果。", approach: "先明确层次和变量，再沿生命过程解释结果。", firstQuestion: "题目研究的是哪个对象，改变了什么条件？" },
        chinese: { goal: "用原文证据解释词句、结构或主旨，而不是凭印象作答。", keyClue: "先定位题目所指的原句和上下文。", approach: "原文证据—语言现象—具体作用—回扣设问。", firstQuestion: "哪一句原文能直接支撑你的判断？" },
        english: { goal: "Ground the answer in the text and clarify sentence or discourse relations.", keyClue: "Locate the exact sentence, connector, subject and predicate.", approach: "Evidence—language feature—meaning in context—answer.", firstQuestion: "Which exact words in the text support the answer?" },
        history: { goal: "把材料放入时空坐标，用史实建立背景、过程和影响的因果链。", keyClue: "标出时间、地点、人物和材料中的变化。", approach: "材料事实与评价分开，再建立因果联系。", firstQuestion: "材料明确给出了哪些可核对的历史事实？" },
        geography: { goal: "从区域位置出发，连接自然与人文要素，解释空间差异和过程。", keyClue: "先读图例、方位、尺度和题干中的区域要素。", approach: "定位—要素—联系—过程—影响。", firstQuestion: "这个区域在哪里，题目给了哪些要素？" },
        politics: { goal: "根据设问把材料分层，让每个观点都有材料和概念依据。", keyClue: "圈出设问动词、材料主体、行为和结果。", approach: "设问方向—材料信息—概念匹配—规范论证。", firstQuestion: "设问要求回答原因、体现、意义还是措施？" },
    };
    return guides[problem.subject];
}
function recognizeMock(subject, gradeBand) {
    const normalizedBand = (0, curriculum_1.normalizeSubjectBand)(subject, gradeBand);
    return { ...samples[subject][normalizedBand], subject, gradeBand: normalizedBand, confidence: 0.94, userRevised: false };
}
function isBuiltInMockProblem(problem) {
    const sample = recognizeMock(problem.subject, problem.gradeBand);
    const compact = (value) => value.normalize("NFKC").replace(/[\s，。；：！？?,.!、“”‘’（）()\[\]【】]/g, "").toLowerCase();
    return compact(problem.text) === compact(sample.text);
}
function analyzeMock(problem, provider, reasoningLevel = "light") {
    const now = new Date().toISOString();
    const root = {
        id: uid("root"), conceptId: `problem.${problem.subject}`, title: "原题", kind: "problem", difficulty: 10,
        atomic: false, curriculumVersion: problem.gradeBand === "senior" ? "cn-highschool-2017-2020" : "cn-compulsory-2022",
        simplification: "从原题倒推必须掌握的直接知识。", state: "unchecked", attempts: 0,
        diagnosticEvidence: problem.text,
        teaching: teachingFor("原题建模"), check: originalCheck(problem),
    };
    const nodes = directConcepts[problem.subject][problem.gradeBand].map(nodeFromConcept);
    const edges = nodes.map((node) => ({ from: node.id, to: root.id, reason: `完成原题前需要先掌握${node.title}` }));
    const session = {
        schemaVersion: "1.1", requestId: uid("req"), provider, reasoningLevel, modelId: `${provider}-demo`, mode: "demo", problem, problemGuide: problemGuideMock(problem), flow: (0, flow_1.createInitialFlow)(),
        nodes: [root, ...nodes], edges, rootNodeId: root.id, currentNodeId: nodes.slice().sort((a, b) => a.difficulty - b.difficulty)[0]?.id ?? null,
        stage: "diagnosing", evidence: [], transferCheck: null, originalPassed: false, transferPassed: false, createdAt: now, updatedAt: now,
    };
    (0, graph_1.assertGraphInvariants)(session);
    return session;
}
function expandMock(session, targetNodeId) {
    const target = session.nodes.find((node) => node.id === targetNodeId);
    if (!target)
        throw new Error("找不到要继续拆解的知识点");
    const concept = (0, curriculum_1.getConcept)(target.conceptId);
    if (!concept || concept.atomic || concept.prerequisites.length === 0)
        throw new Error("这个知识点已经是当前课标下的最小概念");
    const nodes = concept.prerequisites.map(nodeFromConcept);
    const edges = nodes.map((node) => ({ from: node.id, to: target.id, reason: `${node.title}是理解${target.title}的直接前置` }));
    return { nodes, edges };
}
function normalize(value) {
    return value.toLowerCase().replace(/[\s，。；:：（）()]/g, "").replace(/公里/g, "千米");
}
function verifyMock(check, answer) {
    const actual = normalize((0, assessment_1.affirmedAnswerCandidate)(answer) ?? answer);
    const expected = normalize(check.answer);
    const negatedExpected = (0, assessment_1.explicitlyNegatesExpected)(check.answer, answer);
    const actualNumbers = actual.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const expectedNumbers = expected.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const numericEquivalent = actualNumbers.length > 0 && actualNumbers.length === expectedNumbers.length &&
        actualNumbers.every((value, index) => Math.abs(value - expectedNumbers[index]) <= Math.max(1e-9, Math.abs(expectedNumbers[index]) * 1e-6));
    const semantic = semanticOpenAnswer(check, actual);
    const shortExpectedIncluded = /^[a-z\u4e00-\u9fff]{1,12}$/i.test(expected) && actual.includes(expected);
    const passed = actual.length > 0 && !negatedExpected && (actual === expected || numericEquivalent || shortExpectedIncluded || semantic);
    return { passed, explanation: passed ? `回答正确。${check.explanation}` : `这一步还没有稳定掌握。${check.explanation}` };
}
function semanticOpenAnswer(check, actual) {
    if (check.type !== "short_text" || actual.length < 6)
        return false;
    const rubric = (0, mock_sample_content_1.openAnswerRubric)(check);
    if (!rubric || explicitContradiction(actual) || rubric.forbidden?.some((pattern) => pattern.test(actual)))
        return false;
    return rubric.required.every((pattern) => pattern.test(actual));
}
function explicitContradiction(actual) {
    const concept = "关系|作用|影响|证据|背景|变化|意义|观点|反馈|对照|一致|联系|差异|让步|机制|解释|结论|保障|保护|抬升|胰岛素|concession|evidence|control|relation|mechanism|explanation";
    const contradiction = new RegExp(`(?:不是|并非|不属于|不体现|不支持|没有|毫无|并未|未产生|不会|不能|无需|不需要|hardly|never|not|isn't|doesn't|no).*(?:${concept})|(?:${concept}).*(?:无关|不存在|没有|毫无|并未|不能|不支持|hardly|never|not)`, "i");
    const reversed = new RegExp(`(?:${concept}).*(?:错误|纯属虚构|虚构|不成立|只是巧合|fails?to|incorrect|wrong)`, "i");
    const rejectedClaim = /(?:fails?\s*to|说法有误|解释.{0,8}站不住脚|这种(?:说法|解释|机制|观点).{0,8}(?:错误|有误|不成立)|纯属虚构)/i;
    return actual.split(/[。！？!?；;]+/).some((clause) => contradiction.test(clause) || reversed.test(clause) || rejectedClaim.test(clause));
}
function transferCheckMock(subject, gradeBand) {
    const bank = {
        math: gradeBand === "senior"
            ? { id: uid("transfer"), conceptId: "math.function.quadratic", prompt: "求二次函数 y=x²-6x+5 的顶点坐标。", type: "short_text", answer: "(3,-4)", explanation: "系数变化后仍能用配方确定顶点，才算真正掌握。" }
            : { id: uid("transfer"), conceptId: gradeBand === "primary" ? "math.rate.unit-rate" : "math.algebra.linear-equation", prompt: gradeBand === "primary" ? "每小时行驶 70 千米，4 小时行驶多少千米？" : "把刚才的方法迁移到：2(x+1)=10。求 x。", type: "short_text", answer: gradeBand === "primary" ? "280" : "4", explanation: "数字和表述变化后仍能独立使用同一知识关系，才算真正掌握。" },
        physics: { id: uid("transfer"), conceptId: gradeBand === "senior" ? "physics.newton.second-law" : "physics.motion.speed", prompt: gradeBand === "senior" ? "质量 4 kg 的物体受 12 N 合力，加速度是多少？" : "自行车 6 秒行驶 72 米，速度是多少？", type: "short_text", answer: gradeBand === "senior" ? "3" : "12", explanation: "关系式不变，只替换新的情境与数值。" },
        chemistry: { id: uid("transfer"), conceptId: gradeBand === "senior" ? "chemistry.mole.amount" : "chemistry.equation.balance", prompt: gradeBand === "senior" ? "2 mol O₂ 含多少个氧分子？" : "配平：N₂ + H₂ → NH₃，请写三个系数。", type: "short_text", answer: gradeBand === "senior" ? "1.204×10²⁴" : "1,3,2", explanation: "新的反应或数量仍要遵循相同的守恒与计量关系。" },
        biology: { id: uid("transfer"), conceptId: "biology.experiment.variable", prompt: "探究温度对种子萌发的影响，应如何设置两组实验？", type: "short_text", answer: "只改变温度，其他条件相同", explanation: "研究对象变化后仍需坚持单一变量和对照。" },
        chinese: { id: uid("transfer"), conceptId: "chinese.reading.evidence", prompt: "材料：‘他把信封拿起又放下，走到门口又退了回来。’摘录能表现人物犹豫的原文，并说明依据。", type: "short_text", answer: "拿起又放下、走到门口又退回+反复动作表现犹豫", explanation: "材料变化后仍要从原文证据出发。" },
        english: { id: uid("transfer"), conceptId: "english.reading.evidence", prompt: "Read: ‘I was ready to leave, but after hearing her reason, I stayed.’ Find the phrase that shows the speaker changed his mind and explain it.", type: "short_text", answer: "I stayed+shows the decision changed", explanation: "A new passage still requires exact evidence and interpretation." },
        history: { id: uid("transfer"), conceptId: "history.material.fact", prompt: "材料：1898年改革措施开始推行，1900年相关措施停止。列出一项材料事实，并判断它属于过程还是结果。", type: "short_text", answer: "1898年改革措施开始推行+过程", explanation: "新材料中仍需分开事实提取与历史解释。" },
        geography: { id: uid("transfer"), conceptId: "geography.region.location", prompt: "材料：该地位于山脉迎风坡，夏季盛行湿润海风。说明区域位置特征，并列出一个影响降水的要素。", type: "short_text", answer: "山脉迎风坡+湿润海风", explanation: "更换区域后仍应从定位和要素开始。" },
        politics: { id: uid("transfer"), conceptId: "politics.question.direction", prompt: "材料：社区增设无障碍通道，方便老年人和残障人士出行。设问为‘说明这一措施的意义’，写出一条材料与观点结合的回答。", type: "short_text", answer: "增设无障碍通道+保障平等参与社会生活", explanation: "材料变化后仍需由设问控制论证结构。" },
    };
    return bank[subject];
}
function similarCheckMock(node) {
    const correct = node.teaching.expectedSignal.trim();
    const misconception = node.teaching.misconception.trim();
    const fallbackWrong = `只记住“${node.check.answer}”，不说明为什么`;
    return {
        id: uid("similar"),
        conceptId: node.conceptId,
        prompt: `换一个情境检查“${node.title}”：下面哪种表现说明真正理解了？`,
        type: "choice",
        choices: [correct, misconception === correct ? fallbackWrong : misconception, "只照抄原题步骤，不解释条件之间的关系"],
        answer: correct,
        explanation: `这道新题仍然只检查“${node.title}”，但不复用上一题的问法。`,
    };
}
function solutionMock(problem) {
    return (0, mock_sample_content_1.solutionForSample)(problem);
}
