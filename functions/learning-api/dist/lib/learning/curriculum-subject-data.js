"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectNativeConcepts = void 0;
const compulsory = "cn-compulsory-2022";
const highSchool = "cn-highschool-2017-2020";
exports.subjectNativeConcepts = [
    { id: "biology.structure.function", title: "结构与功能相适应", subject: "biology", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["结构功能", "形态结构"], prerequisites: [] },
    { id: "biology.process.material-energy", title: "生命过程中的物质与能量", subject: "biology", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["物质转化", "能量流动"], prerequisites: [] },
    { id: "biology.experiment.variable", title: "生物实验变量与对照", subject: "biology", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["单一变量", "对照实验"], prerequisites: [] },
    { id: "biology.homeostasis.regulation", title: "稳态与调节", subject: "biology", gradeBands: ["senior"], version: highSchool, difficulty: 2, atomic: false, aliases: ["反馈调节", "内环境稳态"], prerequisites: ["biology.structure.function"] },
    { id: "chinese.reading.evidence", title: "原文信息定位", subject: "chinese", gradeBands: ["primary", "junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["回到原文", "信息筛选"], prerequisites: [] },
    { id: "chinese.language.expression", title: "词句表达效果", subject: "chinese", gradeBands: ["primary", "junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["赏析词句", "表达作用"], prerequisites: [] },
    { id: "chinese.structure.purpose", title: "篇章结构与作用", subject: "chinese", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 2, atomic: false, aliases: ["承上启下", "照应"], prerequisites: ["chinese.reading.evidence"] },
    { id: "chinese.reading.theme", title: "主旨与作者态度", subject: "chinese", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 3, atomic: false, aliases: ["中心思想", "情感态度"], prerequisites: ["chinese.reading.evidence", "chinese.language.expression"] },
    { id: "english.reading.evidence", title: "Locate textual evidence", subject: "english", gradeBands: ["primary", "junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["定位原句", "text evidence"], prerequisites: [] },
    { id: "english.sentence.roles", title: "Sentence roles", subject: "english", gradeBands: ["primary", "junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["主谓宾", "sentence structure"], prerequisites: [] },
    { id: "english.grammar.relation", title: "Grammar and logical relation", subject: "english", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 2, atomic: false, aliases: ["时态", "从句", "逻辑连接"], prerequisites: ["english.sentence.roles"] },
    { id: "english.reading.inference", title: "Evidence-based inference", subject: "english", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 2, atomic: false, aliases: ["推断题", "作者态度"], prerequisites: ["english.reading.evidence"] },
    { id: "history.time.space", title: "历史时空定位", subject: "history", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["年代", "时空坐标"], prerequisites: [] },
    { id: "history.material.fact", title: "史料事实提取", subject: "history", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["材料信息", "史料实证"], prerequisites: [] },
    { id: "history.cause.effect", title: "历史因果关系", subject: "history", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 2, atomic: false, aliases: ["背景原因", "影响"], prerequisites: ["history.time.space", "history.material.fact"] },
    { id: "history.comparison", title: "历史比较与评价", subject: "history", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 3, atomic: false, aliases: ["异同", "历史评价"], prerequisites: ["history.material.fact"] },
    { id: "geography.region.location", title: "区域与空间定位", subject: "geography", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["经纬位置", "区域定位"], prerequisites: [] },
    { id: "geography.factor.extract", title: "自然与人文要素提取", subject: "geography", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["气候地形", "人口产业"], prerequisites: [] },
    { id: "geography.process.mechanism", title: "地理过程与形成机制", subject: "geography", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 2, atomic: false, aliases: ["形成原因", "过程机制"], prerequisites: ["geography.region.location", "geography.factor.extract"] },
    { id: "geography.human.land", title: "人地关系与区域发展", subject: "geography", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 2, atomic: false, aliases: ["人地协调", "可持续发展"], prerequisites: ["geography.factor.extract"] },
    { id: "politics.question.direction", title: "设问方向识别", subject: "politics", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["题型", "答题方向"], prerequisites: [] },
    { id: "politics.material.layer", title: "材料分层与信息提取", subject: "politics", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 1, atomic: true, aliases: ["材料关键词", "分层概括"], prerequisites: [] },
    { id: "politics.concept.match", title: "材料与概念匹配", subject: "politics", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 2, atomic: false, aliases: ["观点原理", "知识调用"], prerequisites: ["politics.question.direction", "politics.material.layer"] },
    { id: "politics.argument.expression", title: "观点论证与规范表达", subject: "politics", gradeBands: ["junior", "senior"], version: compulsory, difficulty: 3, atomic: false, aliases: ["材料加观点", "规范作答"], prerequisites: ["politics.concept.match"] },
];
