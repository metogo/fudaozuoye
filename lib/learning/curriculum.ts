import { curriculumCatalog, type CurriculumConcept } from "./curriculum-data";
import type { GradeBand, Subject } from "./types";

export type { CurriculumConcept } from "./curriculum-data";

const concepts = curriculumCatalog;
assertCurriculumCatalog();

export { curriculumCatalog };

export function getConcept(id: string): CurriculumConcept | undefined {
  return concepts.find((concept) => concept.id === id);
}

export function isCurriculumAncestor(ancestorId: string, descendantId: string): boolean {
  const visited = new Set<string>();
  const visit = (currentId: string): boolean => {
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    const current = getConcept(currentId);
    if (!current) return false;
    if (current.prerequisites.includes(ancestorId)) return true;
    return current.prerequisites.some(visit);
  };
  return ancestorId !== descendantId && visit(descendantId);
}

export function listConcepts(subject: Subject, gradeBand: GradeBand): CurriculumConcept[] {
  return concepts.filter((concept) => concept.subject === subject && isBandAtOrBelow(concept.gradeBands, gradeBand));
}

export function isConceptAllowed(id: string, subject: Subject, gradeBand: GradeBand): boolean {
  const concept = getConcept(id);
  return Boolean(concept && concept.subject === subject && isBandAtOrBelow(concept.gradeBands, gradeBand));
}

export function isSupportedSubjectBand(subject: Subject, gradeBand: GradeBand): boolean {
  return subject === "math" || gradeBand !== "primary";
}

export function normalizeSubjectBand(subject: Subject, gradeBand: GradeBand): GradeBand {
  return isSupportedSubjectBand(subject, gradeBand) ? gradeBand : "junior";
}

export function assertCurriculumCatalog(): void {
  const ids = new Set<string>();
  for (const concept of concepts) {
    if (ids.has(concept.id)) throw new Error(`课程目录含重复概念：${concept.id}`);
    ids.add(concept.id);
    if (concept.atomic !== (concept.prerequisites.length === 0)) throw new Error(`课程概念的原子标记与前置关系冲突：${concept.id}`);
  }
  for (const concept of concepts) {
    for (const prerequisiteId of concept.prerequisites) {
      const prerequisite = concepts.find((item) => item.id === prerequisiteId);
      if (!prerequisite) throw new Error(`课程概念引用了不存在的前置：${concept.id} → ${prerequisiteId}`);
      if (prerequisite.subject !== concept.subject) throw new Error(`课程概念跨学科引用前置：${concept.id} → ${prerequisiteId}`);
      if (prerequisite.difficulty >= concept.difficulty) throw new Error(`课程前置没有严格简化：${prerequisiteId} → ${concept.id}`);
    }
  }
}

function isBandAtOrBelow(conceptBands: GradeBand[], learnerBand: GradeBand): boolean {
  const rank: Record<GradeBand, number> = { primary: 1, junior: 2, senior: 3 };
  return conceptBands.some((band) => rank[band] <= rank[learnerBand]);
}
