"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.originalCheckContent = originalCheckContent;
exports.solutionForSample = solutionForSample;
exports.openAnswerRubric = openAnswerRubric;
const answers = {
    math: {
        primary: { answer: "300", explanation: "先求单位时间路程，再乘 5 小时，并检查结果应大于 180 千米。" },
        junior: { answer: "8", explanation: "先将等式两边除以 3，再把括号内的差还原为 x。" },
        senior: { answer: "(2,-1)", explanation: "配方为 $y=(x-2)^2-1$，因此顶点为 $(2,-1)$。" },
    },
    physics: {
        primary: { answer: "10 m/s", explanation: "平均每秒路程等于总路程除以总时间，并保留单位。" },
        junior: { answer: "10 m/s", explanation: "使用 $v=s/t$，写清路程、时间和速度单位。" },
        senior: { answer: "5 m/s²", explanation: "由 $F=ma$ 得 $a=F/m$，代入合力与质量。" },
    },
    chemistry: {
        primary: { answer: "氢元素和氧元素", explanation: "水的化学式为 $\mathrm{H_2O}$，由氢、氧两种元素组成。" },
        junior: { answer: "2,1,2", explanation: "只改化学式前系数，使反应前后氢、氧原子数分别相等。" },
        senior: { answer: "6.02×10²³", explanation: "$1\,\mathrm{mol}$ 指定微粒所含微粒数等于阿伏伽德罗常数。" },
    },
    biology: {
        primary: { answer: "设置有光和无光两组，只改变光照，其他条件保持一致", explanation: "明确自变量、因变量、对照组和控制变量。" },
        junior: { answer: "设置有光和无光两组，只改变光照，其他条件保持一致", explanation: "两组唯一差异是光照，植物、温度、水分和时间等保持一致。" },
        senior: { answer: "血糖升高促进胰岛素分泌，细胞摄取利用葡萄糖并合成糖原，使血糖下降，通过负反馈恢复稳态", explanation: "写清变化、调节信号、效应过程、结果及负反馈。" },
    },
    chinese: {
        primary: { answer: "‘小猫立刻绕到门后，轻轻一跃叼住了线团’；动作迅速准确，表现它机灵", explanation: "必须摘录原句，并把具体动作与‘机灵’联系起来。" },
        junior: { answer: "‘翻过’把风吹树叶写成翻书动作，生动表现树叶连续翻动的画面和节奏", explanation: "不能只报修辞名称，要说明具体画面和表达效果。" },
        senior: { answer: "结尾‘我终于懂得，真正的勇敢是带着害怕仍向前走’点明勇敢的含义，照应前文的害怕与前行并收束主旨", explanation: "同时回答内容作用、结构联系和主旨落点。" },
    },
    english: {
        primary: { answer: "seven", explanation: "The sentence says ‘Tom gets up at seven.’" },
        junior: { answer: "‘The rain became heavier, so she decided to take the bus’ shows the rain made Lucy change from walking to taking the bus", explanation: "Quote the decisive sentence and explain the changed plan." },
        senior: { answer: "Although introduces concession: it rained, but the match continued", explanation: "Identify the connector and explain the relation between both clauses." },
    },
    history: {
        primary: { answer: "1898年；新式学堂开始设立", explanation: "时间和影响都必须逐字来自材料。" },
        junior: { answer: "背景是旧赋税征收混乱；改革统一征收标准并减轻重复负担，从而改善制度运行", explanation: "按材料事实区分背景、措施和影响。" },
        senior: { answer: "共同背景是旧制度不能适应新形势；甲扩大教育，乙调整赋税，影响领域不同", explanation: "使用同一比较维度并分别引用两则材料。" },
    },
    geography: {
        primary: { answer: "我国南方地区", explanation: "图例给出秦岭—淮河以南及湿润区，应据此定位。" },
        junior: { answer: "纬度、海陆位置和季风共同作用", explanation: "从夏冬差异连接太阳辐射、海陆热力性质与季风。" },
        senior: { answer: "迎风坡气流抬升冷却、降水多，背风坡气流下沉、降水少", explanation: "按风向与地形位置写清抬升或下沉过程。" },
    },
    politics: {
        primary: { answer: "遵守公共规则能维护公共秩序，保障大家安全有序地使用公共空间", explanation: "把材料行为与对他人和公共生活的具体意义连接。" },
        junior: { answer: "学生依法维护受教育权，体现公民权利受法律保护，也应依法行使权利", explanation: "材料事实与法治观点必须一一对应。" },
        senior: { answer: "传统与创新既对立又统一，应坚持具体问题具体分析，在继承有价值传统的基础上推动创新", explanation: "使用矛盾分析法并回扣材料中的传统与创新。" },
    },
};
function originalCheckContent(problem) {
    return {
        prompt: `${problem.subject === "english" ? "Now answer independently" : "现在请你独立重做原题"}：\n\n${problem.text}`,
        ...answers[problem.subject][problem.gradeBand],
    };
}
function solutionForSample(problem) {
    const target = answers[problem.subject][problem.gradeBand];
    const steps = solutionSteps[problem.subject][problem.gradeBand];
    return [
        "### 解题思路",
        steps[0],
        "### 分步推导",
        ...steps.slice(1).map((step, index) => `${index + 1}. ${step}`),
        "### 结论",
        target.answer,
        "### 易错提醒",
        `不要只写术语或结论；本题验收依据是：${target.explanation}`,
    ].join("\n\n");
}
const solutionSteps = {
    math: {
        primary: ["先求每小时行驶的路程，再按相同速度求 5 小时路程。", "$180\\div3=60$（千米/时），得到单位时间路程。", "$60\\times5=300$（千米）。", "用 $300\\div5=60$ 反查，速度与原题一致。"],
        junior: ["保持等式两边同步变化，先去掉括号外的倍数。", "等式两边同除以 3，得到 $x-2=6$。", "等式两边同加 2，得到 $x=8$。", "代回：$3(8-2)=18$，等式成立。"],
        senior: ["用配方法把二次函数写成顶点式。", "$x^2-4x=(x-2)^2-4$。", "所以 $y=(x-2)^2-1$。", "平方项最小时 $x=2$，此时 $y=-1$。"],
    },
    physics: {
        primary: ["把总路程平均分到 5 秒，求每秒路程。", "已知 $s=50\\,\\mathrm m$、$t=5\\,\\mathrm s$。", "$v=s/t=50/5=10\\,\\mathrm{m/s}$。", "结果表示每秒行驶 10 米，含义和单位都匹配。"],
        junior: ["先确认研究量是匀速运动的速度。", "列出 $s=50\\,\\mathrm m$、$t=5\\,\\mathrm s$。", "用 $v=s/t$ 代入得到 $10\\,\\mathrm{m/s}$。", "量纲 $\\mathrm m/\\mathrm s$ 与速度一致。"],
        senior: ["研究质量为 2 kg 的物体，合力决定加速度。", "由牛顿第二定律 $F=ma$，变形为 $a=F/m$。", "代入 $10\\,\\mathrm N/2\\,\\mathrm{kg}=5\\,\\mathrm{m/s^2}$。", "正值表示加速度方向与合力方向相同。"],
    },
    chemistry: {
        primary: ["从化学式逐个读取元素符号。", "水的化学式是 $\\mathrm{H_2O}$。", "$\\mathrm H$ 表示氢元素，$\\mathrm O$ 表示氧元素。", "下标 2 表示氢原子个数，不代表第三种元素。"],
        junior: ["只调整化学式前的系数，使两边各元素原子数相等。", "先看氧：左边 2 个 O，右边 1 个 O，先在 $\\mathrm{H_2O}$ 前写 2。", "此时右边有 4 个 H，再在 $\\mathrm{H_2}$ 前写 2。", "得到 $2\\mathrm{H_2}+\\mathrm{O_2}\\rightarrow2\\mathrm{H_2O}$，H、O 原子数均守恒。"],
        senior: ["用物质的量与微粒数关系 $N=nN_A$。", "题中 $n=1\\,\\mathrm{mol}$，对象是氧分子而非氧原子。", "$N=1\\times6.02\\times10^{23}=6.02\\times10^{23}$。", "单位口径仍是“个氧分子”。"],
    },
    biology: {
        primary: ["把光照设为唯一变量，用两组可比较实验观察植物生长。", "实验组有光、对照组无光，植物种类和数量相同。", "温度、水分、土壤、时间和测量方法保持一致。", "比较生长指标的稳定差异，才能判断光照影响。"],
        junior: ["明确自变量是光照，因变量是植物生长指标。", "设置有光和无光两组，只有光照条件不同。", "温度、水分、材料和培养时间保持一致，并重复测量。", "由组间稳定差异得出限定于本实验条件的结论。"],
        senior: ["沿“变化—信号—效应—结果—反馈”追踪血糖调节。", "血糖升高促进胰岛素分泌。", "胰岛素促进细胞摄取利用葡萄糖，并促进合成糖原，使血糖下降。", "血糖回落后刺激减弱，构成负反馈并恢复稳态。"],
    },
    chinese: {
        primary: ["先摘录表现机灵的动作，再解释动作特点。", "证据是“立刻绕到门后，轻轻一跃叼住了线团”。", "“立刻”“一跃”“叼住”写出反应快、动作准确。", "因此这些动作直接表现小猫机灵。"],
        junior: ["从关键词的特殊用法进入具体画面和表达效果。", "“翻过”本来用于翻书页，这里写风吹树叶。", "“一页页”把连续翻动写得有层次和节奏。", "拟人化表达使风与树叶的动态画面更生动。"],
        senior: ["分别回答结尾的内容作用、结构联系和主旨作用。", "结尾点明“勇敢”不是不害怕，而是带着害怕前行。", "它照应前文“虽然害怕，还是迈出第一步”。", "前后呼应并收束全文，深化真正勇敢的主旨。"],
    },
    english: {
        primary: ["Locate the exact time phrase in the sentence.", "The text says: “Tom gets up at seven.”", "The question asks what time, so keep the phrase after “at”.", "Therefore the answer is “seven”, not another remembered time."],
        junior: ["Trace Lucy's original plan, the cause, and her changed decision.", "She first “planned to walk home”.", "“The rain became heavier” gives the cause, and “so” links it to the result.", "“She decided to take the bus” is the changed plan supported by the sentence."],
        senior: ["Identify the connector and compare the two clauses.", "“Although” introduces the fact that it rained.", "“the match continued” gives an unexpected result despite that fact.", "The two clauses therefore form a concession relation."],
    },
    history: {
        primary: ["只从材料提取时间和明确影响。", "“1898年”是改革措施开始推行的时间。", "“新式学堂开始设立”是材料明确写出的影响。", "不补写材料未给出的其他改革结果。"],
        junior: ["按改革前、改革措施、改革后影响拆分史料。", "背景是旧赋税标准不一、重复负担严重。", "措施是统一征收标准，由此减少重复负担、改善制度运行。", "背景和影响必须分别对应改革前后事实。"],
        senior: ["先统一比较维度，再分别引用两则史料。", "共同背景：两种旧制度都不能适应新形势。", "甲的变化落在教育领域，新式学堂增多；乙落在赋税领域，标准统一。", "结论只覆盖材料给出的共同背景和不同影响。"],
    },
    geography: {
        primary: ["先用图例中的界线和降水信息定位区域。", "地点在秦岭—淮河以南。", "年降水量在 800 毫米以上，符合南方湿润区特征。", "两项图例证据共同指向我国南方地区。"],
        junior: ["把季节差异连接到纬度、海陆位置和季风过程。", "夏季太阳辐射较强，且湿润季风带来水汽，所以高温多雨。", "冬季受冷空气和偏干季风影响，温度低、降水少。", "气候特征来自多个要素共同作用，不能只复述现象。"],
        senior: ["沿气流方向比较山地两侧的抬升与下沉过程。", "湿润气流先到东坡，沿迎风坡抬升并冷却凝结，降水较多。", "越过山顶后在西坡下沉增温，水汽不易凝结，降水较少。", "风向、坡向和中间过程共同解释空间差异。"],
    },
    politics: {
        primary: ["把排队、不追逐的行为连接到公共生活结果。", "按顺序排队减少拥挤，不追逐打闹降低安全风险。", "这些规则让每个人都能安全、有序地使用图书馆。", "因此遵守公共规则维护公共秩序并保障共同利益。"],
        junior: ["按“侵权事实—维权行为—法治观点”组织。", "学校无故拒绝入学，侵害学生受教育权。", "学生依法申诉并恢复入学，说明权利可依法维护。", "材料体现公民权利受法律保护，也要求依法行使权利。"],
        senior: ["用矛盾双方既对立又统一分析传统与创新。", "保留核心技法体现继承有价值的传统。", "使用新材料体现根据实际条件推动创新。", "应具体问题具体分析，在继承基础上创新，而非全盘保留或否定。"],
    },
};
function openAnswerRubric(check) {
    const key = `${check.conceptId ?? ""} ${check.prompt}`;
    if (/homeostasis|血糖/.test(key))
        return { required: [/(?:胰岛素|insulin)/i, /(?:降低|下降|摄取|糖原)/, /(?:负反馈|稳态|恢复)/], forbidden: [/(?:不需要|没有|无)反馈|胰岛素.*(?:升高|增加)血糖/] };
    if (/biology|探究|对照实验/.test(key))
        return { required: [/(?:光照|温度|研究因素|自变量)/, /(?:对照|两组|实验组)/, /(?:(?:其他条件|控制变量|水分|温度).*(?:相同|一致|保持))|(?:(?:相同|一致|保持).*(?:其他条件|控制变量|水分|温度))/], forbidden: [/(?:变量不重要|不要设置对照|无需对照|未保持一致|没有保持一致|其他条件(?:全部)?不同|其他条件不用保持|随机设置)/] };
    if (/chinese|阅读|赏析|结尾段/.test(key))
        return { required: [/(?:原文|‘|“|拿起|放下|翻过|小猫|真正的勇敢)/, /(?:作用|表现|生动|画面|节奏|情感|主旨|照应|犹豫|机灵)/], forbidden: [/(?:证据|原文).*(?:无关|没用|没有作用)|(?:完全无关|没有任何作用)/] };
    if (/english|Read|Although|passage/i.test(key))
        return { required: [/(?:seven|rainbecameheavier|takethebus|istayed|although|textevidence)/i, /(?:shows|change|changed|concession|continued|getsup|decision|because)/i], forbidden: [/(?:although).*(?:not|isn't).*(?:concession)|(?:evidence|text).*(?:irrelevant|unrelated)|matchstopped/i] };
    if (/history|改革|史料/.test(key))
        return { required: [/(?:材料|史料|1898|1900|改革|赋税|学堂|制度)/, /(?:影响|变化|背景|原因|过程|措施|比较)/], forbidden: [/(?:没有|不存在|无)(?:背景|影响|变化)|(?:背景|影响|变化).*(?:没有|无关)/] };
    if (/geography|区域|地形|气候|降水/.test(key))
        return { required: [/(?:区域|位置|地形|气候|风向|迎风坡|湿润海风)/, /(?:过程|影响|形成|降水|联系|差异|抬升)/], forbidden: [/(?:地形|气候|风向).*(?:没有联系|无关|不会)|(?:不会形成|没有)(?:降水|差异)/] };
    if (/politics|权利|义务|无障碍|传统与创新/.test(key))
        return { required: [/(?:材料|权利|义务|无障碍|主体|行为|传统|创新)/, /(?:观点|概念|意义|体现|保护|保障|依法|法治|矛盾)/], forbidden: [/(?:不体现|没有|无)(?:任何)?(?:观点|意义|权利)|(?:权利|义务).*(?:无关|没有)/] };
    return null;
}
