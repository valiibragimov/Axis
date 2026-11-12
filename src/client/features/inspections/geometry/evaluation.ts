import { RULESET, resolveNormativeCriteria, sectionTolerance, sp70Reference } from "../normative-rules.js";
import { compareMeasurement, comparePhysicalMeasurement, measurementNumber, summarizeMeasurements } from "../acceptance.js";
import { getConstructionProfile, getConstructionModuleBehavior, normalizeConstructionKey } from "../../../app/construction.js";
import { getInspectionStatus } from "../../../app/inspection-registry.js";
import type { GeometryCheckRecord } from "../../../types/module-records.js";
import { commonDimensionKeys, elementDimensionKeys, type PhysicalDimensions } from "./dimensions.js";

interface GeometryMeasurement {
  label: string;
  project: number | null;
  actual: number | null;
  criteria: GeometryCheckRecord["acceptanceCriteria"];
  key: string;
  status: ReturnType<typeof compareMeasurement>;
}

export function evaluateGeometryCheck(check: GeometryCheckRecord) {
  const construction = normalizeConstructionKey(check.construction || check.constructionType, "");
  const applicable = getInspectionStatus(construction, "geometry", check.constructionSubtype || "", check.constructionPileElement || "");
  const measurements: GeometryMeasurement[] = [];
  if (applicable !== "object") return { ...summarizeMeasurements([]), measurements };
  const savedCriteria = check.acceptanceCriteria;
  const context = savedCriteria?.normativeRule?.split("/")[1] || "";
  const useNormativeDimensions = savedCriteria?.normativeRule?.startsWith(`${RULESET}/`) &&
    ["monolithic", "monolithic-floor-support", "precast-beam-support"].includes(context);
  const criteria = useNormativeDimensions
    ? resolveNormativeCriteria("geometry", construction, context, savedCriteria?.effectiveOn ?? "2026-11-01")
    : savedCriteria;
  const positions: Record<string, number> = { vertical: 1, clearSpan: 5, section: 6, thickness: 6, opening: 8 };
  const results: Array<ReturnType<typeof compareMeasurement>> = [];
  const assess = (project: unknown, actual: unknown, key: string, basis = criteria, physical = true, label = key) => {
    const status = (physical ? comparePhysicalMeasurement : compareMeasurement)(project, actual, key, basis);
    results.push(status);
    if (measurementNumber(actual) != null || (physical && measurementNumber(project) != null)) {
      measurements.push({ label, project: measurementNumber(project), actual: measurementNumber(actual),
        criteria: useNormativeDimensions && basis?.effectiveOn && positions[key]
          ? { ...basis, reference: sp70Reference(`5.18.3, табл. 5.12, поз. ${positions[key]}`, basis.effectiveOn) } : basis, key, status });
    }
  };
  const pair = (row: Record<string, unknown>, project: string, actual: string, key: string, label = key) => {
    const p = measurementNumber(row[project]);
    const a = measurementNumber(row[actual]);
    const automaticSection = useNormativeDimensions && criteria != null && (key === "section" || key === "thickness");
    const section = automaticSection ? sectionTolerance(p) : null;
    const basis = criteria && section ? { ...criteria, limits: { [key]: section } } : criteria;
    assess(p, a, key, basis, true, label);
  };
  const dimensions = (row: Record<string, unknown>, keys: string[]) => {
    const values = row.physicalDimensions as PhysicalDimensions | undefined;
    for (const key of keys) {
      const value = values?.[key];
      if (construction === "excavation" && (!value || (measurementNumber(value.project) === null && measurementNumber(value.actual) === null))) continue;
      const automaticSpan = useNormativeDimensions && criteria != null && ["length", "clearLength", "clearWidth"].includes(key);
      pair(value || {}, "project", "actual", automaticSpan ? "clearSpan" : "dimensions", key);
    }
  };
  dimensions(check, commonDimensionKeys(construction, String(check.constructionPileElement || "")));
  if (construction === "excavation") return { ...summarizeMeasurements(results), measurements };
  const profile = getConstructionProfile(construction, "geometry");
  const rows = profile === "column" ? check.columns : profile === "wall" ? check.walls : profile === "beam" ? check.beams : profile === "stair" ? check.stairs : null;
  const kind = profile === "column" ? "columns" : profile === "wall" ? "walls" : profile === "beam" ? "beams" : "stairs";
  if (["column", "wall", "beam", "stair"].includes(profile)) {
    if (!rows?.length) results.push("incomplete");
    for (const row of rows || []) {
      dimensions(row, elementDimensionKeys(kind));
      if (profile === "column") {
        pair(row, "projSize1", "factSize1", "section");
        pair(row, "projSize2", "factSize2", "section");
      } else if (profile === "wall") pair(row, "projThick", "factThick", "thickness");
      else if (profile === "beam") {
        pair(row, "projBeamWidth", "factBeamWidth", "section");
        pair(row, "projBeamHeight", "factBeamHeight", "section");
      } else {
        pair(row, "projFlightWidth", "factFlightWidth", "dimensions");
        if (!String(row.position || "").trim()) results.push("incomplete");
        if (row.elementType !== "landing") {
          pair(row, "projStepHeight", "factStepHeight", "step");
          pair(row, "projStepWidth", "factStepWidth", "step");
        }
      }
      if (profile === "wall" || profile === "column") assess(0, row.vertDev, "vertical", criteria, false);
      if (profile === "wall") {
        assess(0, row.factWallFlatness, "flatness", criteria, false);
        // Opening position elevations are historical fields, not geometry dimensions.
        openings(row);
      }
    }
  } else if (profile === "formwork") {
    pair(check, "formworkProjHeight", "formworkFactHeight", "dimensions");
    pair(check, "formworkProjWidth", "formworkFactWidth", "dimensions");
    pair(check, "formworkProjThickness", "formworkFactThickness", "thickness");
    assess(0, check.formworkVerticalDeviation, "vertical", criteria, false);
  } else {
    pair(check, "projPlateHeight", "factPlateHeight", "thickness");
    if (getConstructionModuleBehavior(construction, "geometry", check.constructionSubtype || "", check.constructionPileElement || "").showPlateFlatness) assess(0, check.factPlateFlatness, "flatness", criteria, false);
    openings(check);
  }
  function openings(row: Record<string, unknown>) {
    const p = String(row.projOpeningSizes ?? row.openingSizes ?? "").trim();
    const a = String(row.factOpeningSizes ?? "").trim();
    if (!p && !a) return;
    // Keep entered order: differently located openings must not be paired by sorted dimensions.
    const parse = (text: string) => text.split(/[,;\n]+/u).map(value => value.trim().split(/[xх×]/iu).map(measurementNumber));
    const project = parse(p), actual = parse(a);
    if (!p || !a || project.length !== actual.length) { results.push("incomplete"); return; }
    project.forEach((item, index) => {
      const measured = actual[index];
      if (item.length !== 2 || !measured || measured.length !== 2) { results.push("incomplete"); return; }
      for (let i = 0; i < 2; i++) assess(item[i], measured[i], "opening", criteria);
    });
  }
  return { ...summarizeMeasurements(results), measurements };
}
