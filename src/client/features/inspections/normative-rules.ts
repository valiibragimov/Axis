import type { AcceptanceCriteria } from "./acceptance.js";

export type NormativeModule = "geo" | "geometry" | "reinforcement";
export const RULESET = "sp70-2026-11-v1";
export const SP70_TABLE_TRANSITION = "2027-03-01";
const TIED_LONGITUDINAL = `${RULESET}/tied-longitudinal`;

export function localInspectionDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const NORMATIVE_OPTIONS = [
  { id: "precast-base", module: "geo", ru: "Сборный элемент: риски в нижнем сечении, X/Y вдоль осей рисок", en: "Precast element: lower marks, X/Y along the marked axes" },
  { id: "bearing-level", module: "geo", ru: "Монолитная опорная поверхность под стальной или сборный элемент", en: "Cast-in-place bearing level for a steel or precast element" },
  { id: "monolithic", module: "geometry", ru: "Готовая монолитная бетонная или железобетонная конструкция", en: "Completed cast-in-place concrete structure" },
  { id: "monolithic-floor-support", module: "geometry", ru: "Монолитная стена или колонна под монолитным перекрытием: вертикальность на всю высоту", en: "Cast-in-place wall or column supporting cast-in-place floors: full-height verticality" },
  { id: "precast-beam-support", module: "geometry", ru: "Монолитная стена или колонна под сборными балками: вертикальность на всю высоту", en: "Cast-in-place wall or column supporting precast beams: full-height verticality" },
  { id: "tied-longitudinal", module: "reinforcement", ru: "Вязаный каркас или сетка в монолите: продольный шаг, хомуты и защитный слой", en: "Cast-in-place tied cage or mesh: longitudinal spacing, stirrups and cover" }
] as const;

const supportedGeometry = new Set(["foundation_slab", "strip_foundation", "floor_slab", "column", "wall", "beam", "elevator_shaft"]);
const bearingConstructions = new Set(["foundation_slab", "strip_foundation", "floor_slab"]);

export function sp70Reference(clause: string, effectiveOn: string) {
  const revision = effectiveOn >= SP70_TABLE_TRANSITION ? "изм. № 8, редакция с 01.03.2027" : "редакция таблицы до 01.03.2027";
  return `СП 70.13330.2012, ${clause} (${revision})`;
}

export function resolveNormativeCriteria(module: NormativeModule, construction: string, context: string, effectiveOn = localInspectionDate()): AcceptanceCriteria | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(effectiveOn) || effectiveOn < "2025-03-04") return null;
  const timestamp = Date.parse(effectiveOn);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== effectiveOn) return null;
  const limits: AcceptanceCriteria["limits"] = {};
  let clause: string;
  if (module === "geo" && context === "precast-base" && ["column", "beam"].includes(construction)) {
    limits.geoPlan = { min: -8, max: 8 };
    clause = "6.1.7, табл. 6.1, поз. 3";
  } else if (module === "geo" && context === "bearing-level" && bearingConstructions.has(construction)) {
    limits.geoHeight = { min: -5, max: 0 };
    clause = "5.18.3, табл. 5.12, поз. 9";
  } else if (module === "reinforcement" && context === "tied-longitudinal" && supportedGeometry.has(construction)) {
    clause = "5.16.12, 5.16.16, табл. 5.10, поз. 1";
  } else if (module === "geometry" && supportedGeometry.has(construction) && (
    context === "monolithic" || (["wall", "column"].includes(construction) && ["monolithic-floor-support", "precast-beam-support"].includes(context))
  )) {
    limits.opening = { min: -12, max: 12 };
    limits.clearSpan = { min: -20, max: 20 };
    clause = "5.18.3, табл. 5.12, поз. 5, 6, 8";
    if (context !== "monolithic") {
      const max = context === "monolithic-floor-support" ? 15 : 10;
      limits.vertical = { min: -max, max };
      clause = "5.18.3, табл. 5.12, поз. 1, 5, 6, 8";
    }
  } else {
    return null;
  }
  return {
    confirmed: true,
    reference: sp70Reference(clause, effectiveOn),
    normativeRule: `${RULESET}/${context}`,
    effectiveOn,
    limits
  };
}

export function sectionTolerance(designMm: number | null) {
  if (designMm == null || !Number.isFinite(designMm) || designMm <= 0) return null;
  if (designMm <= 200) return { min: -3, max: 6 };
  if (designMm >= 2000) return { min: -20, max: 25 };
  if (designMm <= 400) {
    const ratio = (designMm - 200) / 200;
    return { min: -3 - 6 * ratio, max: 6 + 5 * ratio };
  }
  const ratio = (designMm - 400) / 1600;
  return { min: -9 - 11 * ratio, max: 11 + 14 * ratio };
}

export function isNormativeBearingLevel(criteria: AcceptanceCriteria | null | undefined) {
  return criteria?.normativeRule === `${RULESET}/bearing-level`;
}

export function reinforcementMeasurementCriteria(criteria: AcceptanceCriteria | null | undefined, key: string, designMm: number | null) {
  if (criteria?.normativeRule !== TIED_LONGITUDINAL || !criteria.confirmed || !criteria.effectiveOn || designMm == null || designMm <= 0) return criteria;
  let limit: { min: number; max: number } | undefined;
  let position = 1;
  if (key === "step") {
    const max = Math.min(designMm / 4, 50);
    limit = { min: -max, max };
  } else if (key === "hoopsStep" && criteria.hoopsSectionMm && criteria.hoopsSectionMm > 0) {
    const max = Math.min(criteria.hoopsSectionMm / 25, 25);
    limit = { min: -max, max };
  } else if (key === "cover" && criteria.coverSectionMm && Number.isInteger(criteria.coverSectionMm) && criteria.coverSectionMm > 0 && designMm >= 16) {
    const h = criteria.coverSectionMm;
    position = 7;
    limit = { min: designMm > 20 || h > 300 ? -5 : -3, max: h <= 100 ? 4 : h <= 200 ? 8 : h <= 300 ? 10 : 15 };
  }
  return limit ? { ...criteria, reference: sp70Reference(`5.16.12, 5.16.16, табл. 5.10, поз. ${position}`, criteria.effectiveOn), limits: { [key]: limit } } : criteria;
}
