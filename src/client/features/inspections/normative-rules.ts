import type { AcceptanceCriteria } from "./acceptance.js";

export type NormativeModule = "geo" | "geometry";
export const RULESET = "sp70-2026-11-v1";
export const NORMATIVE_OPTIONS = [
  { id: "precast-base", module: "geo", ru: "Сборный элемент: риски в нижнем сечении, X/Y вдоль осей рисок", en: "Precast element: lower marks, X/Y along the marked axes" },
  { id: "bearing-level", module: "geo", ru: "Монолитная опорная поверхность под стальной или сборный элемент", en: "Cast-in-place bearing level for a steel or precast element" },
  { id: "monolithic", module: "geometry", ru: "Готовая монолитная бетонная или железобетонная конструкция", en: "Completed cast-in-place concrete structure" }
] as const;

const supportedGeometry = new Set(["foundation_slab", "strip_foundation", "floor_slab", "column", "wall", "beam", "elevator_shaft"]);
const bearingConstructions = new Set(["foundation_slab", "strip_foundation", "floor_slab"]);

export function resolveNormativeCriteria(module: NormativeModule, construction: string, context: string): AcceptanceCriteria | null {
  const limits: AcceptanceCriteria["limits"] = {};
  let clause: string;
  if (module === "geo" && context === "precast-base" && ["column", "beam"].includes(construction)) {
    limits.geoPlan = { min: -8, max: 8 };
    clause = "6.1.7, табл. 6.1, поз. 3";
  } else if (module === "geo" && context === "bearing-level" && bearingConstructions.has(construction)) {
    limits.geoHeight = { min: -5, max: 0 };
    clause = "5.18.3, табл. 5.12, поз. 9";
  } else if (module === "geometry" && context === "monolithic" && supportedGeometry.has(construction)) {
    limits.opening = { min: -12, max: 12 };
    limits.clearSpan = { min: -20, max: 20 };
    clause = "5.18.3, табл. 5.12, поз. 5, 6, 8";
  } else {
    return null;
  }
  return {
    confirmed: true,
    reference: `СП 70.13330.2012, ${clause} (${RULESET})`,
    normativeRule: `${RULESET}/${context}`,
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
