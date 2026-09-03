"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertEnhancedBoardContent = assertEnhancedBoardContent;
exports.enhancedBoardInstructionSignature = enhancedBoardInstructionSignature;
exports.assertNativeMathBoardContent = assertNativeMathBoardContent;
const subjectSignals = {
    math: /对象|已知|待求|条件|关系|式子|方程|函数|图形|变形|等价|不变量|定义域|单位|坐标|坐标轴|横轴|纵轴|分母|代入|椭圆|圆|焦点|长轴|短轴|半轴|顶点|斜率|根|角|边|面积|周长|概率|数列/g,
    physics: /系统|对象|过程|物理量|数值|单位|方向|规律|状态|量纲|现象/g,
    chemistry: /物质|组成|元素|粒子|反应|现象|守恒|系数|数量|条件|类别|标准/g,
    biology: /生命|结构|功能|过程|变量|对照|对象|条件|观察|反馈|稳态|层次/g,
    chinese: /原文|词句|语境|表达|证据|作用|结构|主旨|上下文|设问/g,
    english: /evidence|word|phrase|sentence|subject|predicate|clause|connector|context|meaning|grammar|text/gi,
    history: /时间|空间|时空|材料|史料|事实|背景|措施|过程|影响|因果|主体|范围|比较/g,
    geography: /区域|位置|尺度|图例|方向|要素|地形|气候|空间|过程|影响|人地/g,
    politics: /设问|材料|主体|行为|结果|概念|观点|论证|意义|措施|依据|分层/g,
};
const teachingLead = /^(?:先|再|然后|接着|最后|当前|把|将|按|用|从|检查|核对|区分|标出|提取|比较|解释|限定|验证|回到|不要|不能|避免|只|逐项|分别|继续|保留|明确|建立|组织|判断|说明|复述|换|first|then|finally|identify|check|apply|locate|read|mark|trace|state)/i;
const unsupportedClaim = /(?:翻倍|持续至今|史实表明|事实证明|已经证明|必然导致|直接导致|产量(?:提高|增加|降低|减少)|人口(?:提高|增加|降低|减少)|创造了|消灭了|建立了|推翻了)/;
const assertedOutcome = /(?:促进|导致|造成|带来|使得)[^。！？!?；;]{0,20}(?:繁荣|衰退|提高|降低|增加|减少|改善|恶化|扩大|缩小|增长|发展)/;
const genericTemplate = /(?:通用|统一模板|任意学科|所有学科|不执行|跳过当前|只执行阅读|照抄模板|与学科无关)/;
function assertEnhancedBoardContent(subject, content, purpose, evidence, evidenceUniverse = evidence) {
    const remainder = withoutCanonical(content, purpose, evidence);
    if (genericTemplate.test(remainder))
        throw new Error("增强板书正文不能使用通用模板代替当前学科动作");
    if (unsupportedClaim.test(remainder))
        throw new Error("增强板书正文包含原题证据没有支持的事实断言");
    for (const claim of remainder.match(assertedOutcome) ?? [])
        if (!evidenceUniverse.includes(claim))
            throw new Error("增强板书正文不能补充原题证据未支持的结果性陈述");
    const evidenceNumbers = new Set(numericTokens(evidenceUniverse));
    for (const number of numericTokens(remainder))
        if (!evidenceNumbers.has(number))
            throw new Error("增强板书正文不能补充原题没有给出的数字事实");
    const sentences = remainder.split(/[。！？!?；;]+/).map((item) => item.trim()).filter(Boolean);
    const unsupportedSentence = sentences.find((sentence) => !evidenceUniverse.includes(sentence.replace(/[“”"']/g, "")) && !teachingLead.test(sentence) && !(sentence.match(subjectSignals[subject]) ?? []).length);
    if (unsupportedSentence)
        throw new Error(`增强板书正文只能组织学习动作，事实内容必须保留在逐字证据中：${unsupportedSentence}`);
    const signals = new Set(remainder.match(subjectSignals[subject]) ?? []);
    if (signals.size < 1)
        throw new Error("增强板书正文没有落实当前学科的证据与推理动作");
}
function enhancedBoardInstructionSignature(content, purpose, evidence) {
    return withoutCanonical(content, purpose, evidence)
        .replace(/(?:先)?(?:完成)?(?:第)?(?:步骤|第)[一二三四五六七八九十\d]+(?:步)?/g, "")
        .replace(/[一二三四五六七八九十\d]+$/g, "")
        .replace(/[\s，。！？!?；;：:]/g, "").toLowerCase();
}
function assertNativeMathBoardContent(blocks, expected) {
    if (blocks.length !== 5)
        throw new Error("数学原生板书必须完整覆盖五个推导动作");
    const signatures = blocks.map((block) => compactMathContent(block.content));
    if (new Set(signatures).size !== signatures.length)
        throw new Error("数学原生板书五段内容不能重复");
    const relationText = blocks.slice(0, 2).map((block) => block.content).join("\n");
    const derivationText = blocks[2]?.content ?? "";
    if (expected.relationExpressions.some((expression) => !relationText.includes(expression)))
        throw new Error("数学原生板书没有完整建立题干关系");
    if (expected.derivationExpressions.some((expression) => !derivationText.includes(expression)))
        throw new Error("数学原生板书没有形成有依据的关系推进");
    if (!/(?:检验|检查|复核)/.test(blocks[3]?.content ?? "") || !/(?:迁移|换字母|换数值|重建)/.test(blocks[4]?.content ?? ""))
        throw new Error("数学原生板书缺少可执行复核或题型迁移");
}
function withoutCanonical(content, purpose, evidence) {
    const noPurpose = purpose ? content.split(purpose).join("") : content;
    const noEvidence = evidence ? noPurpose.split(evidence).join("") : noPurpose;
    return noEvidence.replace(/原题依据/g, "").replace(/[“”"']/g, "").replace(/^[。；：，\s]+|[。；：，\s]+$/g, "");
}
function compactMathContent(value) {
    return value.normalize("NFKC").replace(/\$[^$]+\$/g, "公式").replace(/[\s，。！？!?；;：:]/g, "").toLowerCase();
}
function numericTokens(value) {
    return value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (digit) => "0123456789"["⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(digit)])
        .match(/-?\d+(?:\.\d+)?/g) ?? [];
}
