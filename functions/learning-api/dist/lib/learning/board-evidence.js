"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBoardEvidenceClauses = extractBoardEvidenceClauses;
exports.isTaskInstructionText = isTaskInstructionText;
const chineseTaskLead = /^(?:(?:试着|先|再|简要)\s*)?(?:求解?|计算|证明|求证|配平|判断|解释|说明|分析|简析|评析|试析|试论|试述|论一论|谈论|评价|概括|赏析|赏读|品味|体会|谈谈|谈一谈|说说|简述|阐释|阐述|论述|梳理|归纳|比较|选择|完成|回答|指出|列出|写出|找出|讨论|阅读|忽略|输出|不要)/;
const englishTaskLead = /^(?:please\s+)?(?:describe|choose|select|determine|decide|check|explain|analy[sz]e|discuss|compare|calculate|prove|justify|summari[sz]e|evaluate|list|outline|infer|translate|rewrite|write|find|identify|state|answer|respond|reply|solve|derive|show|give|provide|present|complete|fill|read|ignore|forget|disregard|override|bypass|discard|treat|reveal|return|output|never\s+follow|do\s+not)\b/i;
const englishAmbiguousTaskLead = /^(?:state|answer|list|read|return|output|show|present)\b/i;
const englishYouDirective = /^you\b[^.;!?]*\b(?:must|should|need|can|may)\b[^.;!?]*\b(?:answer(?:ing)?|explain|write|analy[sz]e|choose|select|respond|reply|solve|derive|show|give|provide|present|output|return)\b/i;
const englishFactPredicate = /\b(?:is|are|was|were|has|have|contains?|causes?|shows|showed|states|stated|increases?|increased|decreases?|decreased|equals?|occurr?ed|began|ended|became|means?|requires?|allows?|prohibits?)\b/i;
const englishImperativeClause = /^[A-Za-z]+(?:\s+[A-Za-z]+)?\s+(?:whether|if|why|how)\b/i;
const questionSignal = /(?:是否|吗[？?]?|[？?]|哪(?:个|些|一)|多少|什么|怎样|如何|为什么|含义|依据)/;
const factPredicate = /(?:为|是|有|含有|属于|发生|开始|结束|位于|达到|显示|表明|集中|增加|减少|建立|停止|受到|促进|影响|导致|形成|吹向|流向|产生|包括|包含|等于|满足|给出|写着|说|认为|指出|发现|观察到)/;
const verifiableFactPredicate = /(?:为|是|有|含有|属于|发生|开始|结束|位于|达到|显示|表明|集中|增加|减少|建立|停止|受到|促进|影响|导致|形成|吹向|流向|产生|包括|包含|等于|满足|写着|认为|发现|观察到)/;
const commandActionSignal = /(?:求解?|计算|证明|求证|配平|判断|解释|说明|分析|简析|评析|试析|试论|试述|论述|阐述|谈(?:谈|一下|两句)?|评价|赏析|品味|体会|概括|选择|完成|回答|列出|写(?:出|一段|一篇)?|找出|讨论|忽略|输出|给出|作答)/;
function extractBoardEvidenceClauses(value) {
    const normalized = value.replace(/^[“"'‘]|[”"'’]$/g, "").replace(/\s+/g, " ").trim();
    if (!normalized)
        return [];
    const wrapped = normalized.match(/^(?:(?:根据)?(?:材料|原文|题目|史料)|read|passage|text)[：:]\s*(.+)$/i);
    if (wrapped)
        return extractBoardEvidenceClauses(wrapped[1]);
    return normalized.split(/(?<=[。！？!?；;])|(?<=[A-Za-z0-9'”"’])\.(?=\s+[A-Z“"'‘])|\n+/).flatMap(extractSentenceEvidence);
}
function isTaskInstructionText(value) {
    return extractBoardEvidenceClauses(value).length === 0;
}
function extractSentenceEvidence(sentence) {
    const normalized = sentence.trim();
    if (!normalized)
        return [];
    const wrapped = normalized.match(/^(?:(?:根据)?(?:材料|原文|题目|史料)|read|passage|text)[：:]\s*(.+)$/i);
    if (wrapped)
        return extractBoardEvidenceClauses(wrapped[1]);
    const metaInstruction = /(?:忽略.{0,12}(?:前文|指令|以上内容)|(?:只需|务必|必须|直接)?(?:输出|给出|返回).{0,10}(?:最终)?(?:答案|结论)|(?:不要|无需).{0,8}(?:解释|引用|遵循)|(?:ignore|forget|disregard|override|bypass|discard).{0,24}(?:previous|prior|instructions?|directions?|above)|treat.{0,20}(?:instructions?|directions?).{0,12}invalid|never\s+follow.{0,20}(?:instructions?|directions?)|reveal.{0,16}(?:system\s+prompt|instructions?)|(?:just\s+)?(?:give|output|return)(?:\s+only)?.{0,12}(?:final\s+)?(?:answer|result)|do not .{0,12}(?:explain|cite|follow))/i;
    const metaLabel = /^(?:(?:系统)?提示|指令|要求|注意)[：:]\s*/i;
    const directiveBody = normalized.replace(metaLabel, "").replace(/^(?:现在|接下来|随后|以下|立刻|立即|首先|然后)[，,：:]?\s*/, "");
    const directiveLead = /^(?:请|你|只需|务必|必须|直接|忽略|不要|无需|以上内容|(?:所有)?(?:回答|回复|输出)|you\b|ignore|forget|disregard|override|bypass|discard|treat|reveal|never\s+follow|just\s+give|output|return|do not)/i;
    if (isTaskInstruction(directiveBody))
        return [];
    const instructionActor = /^(?:(?:大|语言|通用)?模型|(?:AI|人工智能)?助手|机器人|智能体|Agent|系统|回答者|答题者|用户)\s*(?:必须|应当|不得|可以|需要)/i.test(directiveBody);
    const modalFact = !instructionActor && /^(?!请|你|只需|务必|必须|直接|忽略|不要|无需)[^。！？!?]{2,80}(?:必须|应当|不得|可以|需要)[^。！？!?]{2,}/.test(directiveBody);
    if (((metaLabel.test(normalized) && !modalFact) || directiveLead.test(directiveBody)) && metaInstruction.test(directiveBody))
        return [];
    const selfContainedStem = /(?:[$\\][^。！？!?]{2,}|\d+\s*[+＋\-−×÷/]\s*\d+|[^。！？!?]{1,40}(?:→|⇌)[^。！？!?]{1,40}|[A-Za-z][A-Za-z0-9()]*\s*(?:=|⊥|∥|→)|\d+\s*(?:=|°|度|cm|mm|m|kg|s)\b|三角形.{0,36}(?:=|⊥|∥|中点|直角))/i.test(normalized);
    const hasVerifiableFact = modalFact || verifiableFactPredicate.test(normalized) || /\d|[$\\=→⇌]/.test(normalized);
    if (!selfContainedStem && !hasVerifiableFact && commandActionSignal.test(normalized))
        return [];
    const premises = factualPremisesBeforeQuestion(normalized);
    if (premises.length)
        return premises;
    if (isTaskInstruction(normalized) && !selfContainedStem)
        return [];
    if (questionSignal.test(normalized))
        return selfContainedStem ? [cleanEvidence(normalized)] : [];
    if (isTaskInstruction(normalized))
        return selfContainedStem ? [cleanEvidence(normalized)] : [];
    return [cleanEvidence(normalized)];
}
function factualPremisesBeforeQuestion(value) {
    const parts = value.split(/[，,]/);
    for (let index = 1; index < parts.length; index += 1) {
        const suffix = parts.slice(index).join("，");
        if (!questionSignal.test(suffix) && !isTaskInstruction(suffix))
            continue;
        const premise = parts.slice(0, index).join("，").replace(/^(?:已知|材料表明|题目给出)[：:]?\s*/, "").trim();
        if (premise && !isTaskInstruction(premise) && (factPredicate.test(premise) || /\d|[$\\=→⇌]/.test(premise))) {
            const embeddedGivens = suffix.match(/(?:当|若|给定|取)?\s*[A-Za-z][A-Za-z0-9()]*\s*=\s*[^，,。！？!?；;\s]{1,32}/g) ?? [];
            return [cleanEvidence(premise), ...embeddedGivens.map(cleanEvidence)];
        }
    }
    const compactPremise = value.match(/^(.{4,}?(?:发生|开始|结束|建立|停止|完成|位于|达到|显示|表明|集中|增加|减少|形成|吹向|流向))(?:(?:后|以来)[^。！？!?]{0,20}|的(?:原因|影响|意义|作用)?(?:是)?)(?:哪(?:个|些|一)|多少|什么|怎样|如何|为什么)/)?.[1];
    if (compactPremise)
        return [cleanEvidence(compactPremise)];
    const katexGivens = value.match(/\$[^$\n]{2,}\$/g) ?? [];
    if (questionSignal.test(value) && katexGivens.length)
        return katexGivens.map(cleanEvidence);
    const explicitGivens = value.match(/(?:当|若|给定|取)?\s*[A-Za-z][A-Za-z0-9()]*\s*=\s*[^，,。！？!?；;\s]{1,32}/g) ?? [];
    if (questionSignal.test(value) && explicitGivens.length)
        return explicitGivens.map(cleanEvidence);
    return [];
}
function isTaskInstruction(value) {
    const normalized = value.replace(/[。！？!?；;]+$/, "").trim();
    if (/^(?:分析表明|研究表明|统计表明|(?:分析|判断|计算)(?:结果|报告)(?:表明|显示|等于)|说明书指出)/.test(normalized))
        return false;
    if (englishYouDirective.test(normalized))
        return true;
    if (englishImperativeClause.test(normalized))
        return true;
    if (englishTaskLead.test(normalized) && (!englishAmbiguousTaskLead.test(normalized) || !englishFactPredicate.test(normalized)))
        return true;
    if (/(?:作一评价|展开分析|说一说|谈一番|谈及|加以说明|进行评价|作答|作简要分析)/.test(normalized))
        return true;
    const withoutCourtesy = normalized.replace(/^(?:请|不妨|试着|务必|直接|(?:你)?(?:只需|必须|应当|不得|可以|需要))\s*/, "");
    const materialRef = "(?:材料|史料|题目)(?:[一二三四五六七八九十0-9]+|[（(][一二三四五六七八九十0-9]+[）)])?";
    const frame = new RegExp(`^(?:(?:结合|根据|运用)\\s*(?:所学知识|原文|${materialRef}|上述内容)|联系(?:全文|实际)|以[^，,。]{1,24}为例|从[^，,。]{1,24}(?:角度|出发)|围绕[^，,。]{1,24}|对于[^，,。]{1,24}|关于[^，,。]{1,24}|就[^，,。]{1,24}|依据[^，,。]{1,24})[，,]?\\s*`);
    if (frame.test(withoutCourtesy) && !withoutCourtesy.replace(frame, "").trim())
        return true;
    const core = withoutCourtesy.replace(frame, "");
    if (chineseTaskLead.test(core))
        return true;
    const imperativeFrame = /^(?:围绕|针对|就|对|对于|从|联系|结合|根据|依据|运用|以)/.test(withoutCourtesy);
    const imperativeAction = /(?:作出|给出|写(?:出|一段|一篇)?|谈(?:谈|一下|两句)?|分析|说明|评价|赏析|回答|作答|证明|判断|概括|解释|论述|阐述)/.test(withoutCourtesy);
    return imperativeFrame && imperativeAction;
}
function cleanEvidence(value) {
    return value.replace(/[？?！!；;。]+$/, "").trim();
}
