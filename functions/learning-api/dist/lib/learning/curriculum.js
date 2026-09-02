"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.curriculumCatalog = void 0;
exports.getConcept = getConcept;
exports.isCurriculumAncestor = isCurriculumAncestor;
exports.listConcepts = listConcepts;
exports.isConceptAllowed = isConceptAllowed;
exports.isSupportedSubjectBand = isSupportedSubjectBand;
exports.normalizeSubjectBand = normalizeSubjectBand;
exports.assertCurriculumCatalog = assertCurriculumCatalog;
const curriculum_data_1 = require("./curriculum-data");
Object.defineProperty(exports, "curriculumCatalog", { enumerable: true, get: function () { return curriculum_data_1.curriculumCatalog; } });
const concepts = curriculum_data_1.curriculumCatalog;
assertCurriculumCatalog();
function getConcept(id) {
    return concepts.find((concept) => concept.id === id);
}
function isCurriculumAncestor(ancestorId, descendantId) {
    const visited = new Set();
    const visit = (currentId) => {
        if (visited.has(currentId))
            return false;
        visited.add(currentId);
        const current = getConcept(currentId);
        if (!current)
            return false;
        if (current.prerequisites.includes(ancestorId))
            return true;
        return current.prerequisites.some(visit);
    };
    return ancestorId !== descendantId && visit(descendantId);
}
function listConcepts(subject, gradeBand) {
    return concepts.filter((concept) => concept.subject === subject && isBandAtOrBelow(concept.gradeBands, gradeBand));
}
function isConceptAllowed(id, subject, gradeBand) {
    const concept = getConcept(id);
    return Boolean(concept && concept.subject === subject && isBandAtOrBelow(concept.gradeBands, gradeBand));
}
function isSupportedSubjectBand(subject, gradeBand) {
    if (gradeBand !== "primary")
        return true;
    return subject === "math" || subject === "chinese" || subject === "english";
}
function normalizeSubjectBand(subject, gradeBand) {
    return isSupportedSubjectBand(subject, gradeBand) ? gradeBand : "junior";
}
function assertCurriculumCatalog() {
    const ids = new Set();
    for (const concept of concepts) {
        if (ids.has(concept.id))
            throw new Error(`课程目录含重复概念：${concept.id}`);
        ids.add(concept.id);
        if (concept.atomic !== (concept.prerequisites.length === 0))
            throw new Error(`课程概念的原子标记与前置关系冲突：${concept.id}`);
    }
    for (const concept of concepts) {
        for (const prerequisiteId of concept.prerequisites) {
            const prerequisite = concepts.find((item) => item.id === prerequisiteId);
            if (!prerequisite)
                throw new Error(`课程概念引用了不存在的前置：${concept.id} → ${prerequisiteId}`);
            if (prerequisite.subject !== concept.subject)
                throw new Error(`课程概念跨学科引用前置：${concept.id} → ${prerequisiteId}`);
            if (prerequisite.difficulty >= concept.difficulty)
                throw new Error(`课程前置没有严格简化：${prerequisiteId} → ${concept.id}`);
        }
    }
}
function isBandAtOrBelow(conceptBands, learnerBand) {
    const rank = { primary: 1, junior: 2, senior: 3 };
    return conceptBands.some((band) => rank[band] <= rank[learnerBand]);
}
