import { measurementNumber, type AcceptanceCriteria, type AppliedRule, type ProjectCriterion } from "./acceptance.js";
import { sectionTolerance, type NormativeModule } from "./normative-rules.js";

/** Closed catalogue: an unreviewed revision never inherits the preceding limits. */
export const AUTOMATIC_RULESET = "axis-2026-11-14.1";
const from = "2025-03-04", until = "2027-02-28";
const concrete = ["foundation_slab", "strip_foundation", "floor_slab", "column", "wall", "pylon", "beam", "elevator_shaft", "stair_core"];
export interface RuleDefinition {
  id: string;
  module: NormativeModule;
  constructions: readonly string[];
  parameters: readonly string[];
  required: Record<string, string>;
  reference: string;
  min: number | null;
  max: number | null;
  formula?: AppliedRule["formula"];
  minimumCount: number;
  method: string;
}
const measured = "Измерительный контроль; объём и расположение измерений по соответствующей строке таблицы и РД";
export const AUTOMATIC_RULES: readonly RuleDefinition[] = [
  { id: "sp70-span", module: "geometry", constructions: concrete, parameters: ["length", "clearLength", "clearWidth"], required: { technology: "monolithic", stage: "completed" }, reference: "СП 70.13330.2012, 5.18.3, таблица 5.12, позиция 5", min: -20, max: 20, minimumCount: 0, method: measured },
  { id: "sp70-section", module: "geometry", constructions: concrete, parameters: ["section", "thickness"], required: { technology: "monolithic", stage: "completed" }, reference: "СП 70.13330.2012, 5.18.3, таблица 5.12, позиция 6", min: null, max: null, formula: "section-v1", minimumCount: 0, method: measured },
  { id: "sp70-opening", module: "geometry", constructions: concrete, parameters: ["opening"], required: { technology: "monolithic", stage: "completed" }, reference: "СП 70.13330.2012, 5.18.3, таблица 5.12, позиция 8", min: -12, max: 12, minimumCount: 0, method: measured },
  ...([ ["monolithic", 15], ["precast_beams", 10] ] as const).map(([support, max]): RuleDefinition => ({ id: `sp70-vertical-${support}`, module: "geometry", constructions: ["wall", "column"], parameters: ["vertical"], required: { technology: "monolithic", stage: "completed", support, verticalScope: "full_height" }, reference: "СП 70.13330.2012, 5.18.3, таблица 5.12, позиция 1", min: -max, max, minimumCount: 0, method: measured })),
  { id: "sp70-bearing", module: "geo", constructions: ["foundation_slab", "strip_foundation", "floor_slab"], parameters: ["geoHeight"], required: { technology: "monolithic", surface: "bearing_steel_precast" }, reference: "СП 70.13330.2012, 5.18.3, таблица 5.12, позиция 9", min: -5, max: 0, minimumCount: 0, method: measured },
  { id: "sp70-precast-marks", module: "geo", constructions: ["column", "beam"], parameters: ["geoPlan"], required: { technology: "precast", positioning: "lower_marks" }, reference: "СП 70.13330.2012, 6.1.7, таблица 6.1, позиция 3", min: -8, max: 8, minimumCount: 0, method: "Совмещение рисок нижнего сечения; координаты вдоль осей рисок" },
  ...([ ["step", "spacing-v1", 1], ["hoopsStep", "hoops-v1", 1], ["cover", "cover-v1", 7] ] as const).map(([parameter, formula, position]): RuleDefinition => ({ id: `sp70-${parameter}`, module: "reinforcement", constructions: concrete, parameters: [parameter], required: { technology: "monolithic", reinforcement: "tied" }, reference: `СП 70.13330.2012, 5.16.12, 5.16.16, таблица 5.10, позиция ${position}`, min: null, max: null, formula, minimumCount: 0, method: measured })),
  { id: "sp45-final-bottom", module: "geo", constructions: ["excavation"], parameters: ["geoHeight"], required: { earthStage: "final", location: "foundation", soil: "ordinary" }, reference: "СП 45.13330.2017, 6.1.6, таблица 6.3, позиция 5", min: -50, max: 50, minimumCount: 10, method: "По углам и центру, пересечениям осей, изменениям отметок; не реже 50 м, не менее 10 измерений на участок" },
  ...([ ["dragline", 250, 20], ["front_shovel", 100, 15], ["backhoe", 150, 10], ["hydraulic", 100, 10], ["grading", 50, 5], ["bulldozer", 100, 15], ["trencher", 100, 10], ["scraper", 100, 10] ] as const).map(([method, max, minimumCount]): RuleDefinition => ({ id: `sp45-rough-${method}`, module: "geo", constructions: ["excavation"], parameters: ["geoHeight"], required: { earthStage: "rough", soil: "ordinary", excavationMethod: method }, reference: "СП 45.13330.2017, 6.1.6, таблица 6.3, позиция 1", min: 0, max, minimumCount, method: "Измерительный; случайное расположение контрольных точек" }))
];

export function validInspectionDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function automaticCriteria(module: NormativeModule, construction: string, context: Record<string, string>, date: string,
  project: Record<string, ProjectCriterion> = {}): AcceptanceCriteria {
  const rules: Record<string, AppliedRule> = {};
  const limits: AcceptanceCriteria["limits"] = {};
  const missing: string[] = [];
  if (concrete.includes(construction) && context.controlComplete !== "yes") missing.push("Подтверждение обязательного объёма измерений, осмотра и документов");
  if (concrete.includes(construction) && !context.technology) missing.push("Технология изготовления конструкции");
  if (module === "geometry" && concrete.includes(construction) && !context.stage) missing.push("Стадия выполнения работ");
  if (module === "reinforcement" && concrete.includes(construction) && !context.reinforcement) missing.push("Способ соединения арматуры");
  if (construction === "excavation") for (const key of ["earthStage", "soil", "location", "excavationMethod"]) {
    if (!context[key]) missing.push(`Условия земляных работ: ${key}`);
  }
  const valid = validInspectionDate(date) && date >= from && date <= until;
  if (!valid) missing.push("Редакция нормативов на дату проверки не подтверждена каталогом");
  if (valid) for (const rule of AUTOMATIC_RULES) {
    if (rule.module !== module || !rule.constructions.includes(construction) || !Object.entries(rule.required).every(([key, value]) => context[key] === value)) continue;
    for (const parameter of rule.parameters) {
      rules[parameter] = { id: rule.id, version: AUTOMATIC_RULESET, kind: "normative", parameter, unit: "mm", reference: rule.reference,
        validFrom: from, validTo: until, min: rule.min, max: rule.max, ...(rule.formula ? { formula: rule.formula } : {}),
        method: rule.method, minimumCount: rule.minimumCount, conditions: { ...context, construction, module } };
      if (!rule.formula) limits[parameter] = { min: rule.min, max: rule.max };
    }
  }
  // Project criteria supplement or tighten a known rule; they cannot replace it.
  // Out-of-range dates require a reviewed catalogue, not a project override.
  if (valid) for (const [parameter, criterion] of Object.entries(project)) {
    if (!criterion.confirmed || !criterion.reference.trim() || criterion.min == null || criterion.max == null ||
      !Number.isFinite(criterion.min) || !Number.isFinite(criterion.max) || criterion.min > criterion.max) continue;
    if (!rules[parameter]) {
      rules[parameter] = { id: `project-${parameter}`, version: AUTOMATIC_RULESET, kind: "project", parameter, unit: "mm",
        reference: criterion.reference, validFrom: date, validTo: date, min: criterion.min, max: criterion.max,
        method: "По подтверждённым требованиям РД", minimumCount: 0, conditions: { ...context, construction, module } };
      limits[parameter] = { min: criterion.min, max: criterion.max };
    }
  }
  const reference = [...new Set(Object.values(rules).map(rule => rule.reference))].join("; ");
  return { schemaVersion: 2, context: { ...context }, rules, projectCriteria: Object.fromEntries(Object.entries(project).map(([key, value]) => [key, { ...value }])), missing,
    reference, confirmed: valid && !!reference && missing.length === 0, effectiveOn: date, normativeRule: AUTOMATIC_RULESET, limits };
}

/** Evaluate the persisted rule definition, never today's catalogue. */
export function parameterCriteria(criteria: AcceptanceCriteria | null | undefined, parameter: string, design: unknown): AcceptanceCriteria | null | undefined {
  if (criteria?.schemaVersion != null && criteria.schemaVersion !== 2) return { ...criteria, confirmed: false, limits: {} };
  if (criteria?.schemaVersion !== 2) return criteria;
  const rule = criteria.rules?.[parameter];
  if (!rule) return { ...criteria, confirmed: false, limits: {} };
  // This is the supported snapshot version, deliberately independent of the active catalogue.
  if (rule.version !== "axis-2026-11-14.1" || rule.parameter !== parameter || (rule.formula && !["section-v1", "spacing-v1", "hoops-v1", "cover-v1"].includes(rule.formula))) return { ...criteria, confirmed: false, limits: {} };
  let min = rule.min, max = rule.max;
  const value = measurementNumber(design);
  if (rule.formula) {
    if (value == null || value <= 0) return { ...criteria, confirmed: false, limits: {} };
    if (rule.formula === "section-v1") { const limit = sectionTolerance(value); min = limit?.min ?? null; max = limit?.max ?? null; }
    if (rule.formula === "spacing-v1") { max = Math.min(value / 4, 50); min = -max; }
    const h = measurementNumber(criteria.context?.[parameter === "cover" ? "coverSectionMm" : "hoopsSectionMm"]);
    if (rule.formula === "hoops-v1" && h != null && h > 0) { max = Math.min(h / 25, 25); min = -max; }
    if (rule.formula === "cover-v1" && h != null && h > 0 && Number.isInteger(h) && value >= 16) {
      min = value > 20 || h > 300 ? -5 : -3; max = h <= 100 ? 4 : h <= 200 ? 8 : h <= 300 ? 10 : 15;
    }
  }
  const project = criteria.projectCriteria?.[parameter];
  let reference = rule.reference;
  if (project?.confirmed && project.reference.trim() && project.min != null && project.max != null && min != null && max != null) {
    min = Math.max(min, project.min); max = Math.min(max, project.max); reference += `; РД: ${project.reference}`;
  }
  return { ...criteria, reference, limits: { [parameter]: { min, max } } };
}
