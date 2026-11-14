import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
export * from './src/client/features/inspections/automatic-rules.ts';
export * from './src/client/features/inspections/acceptance.ts';
export * from './src/client/features/inspections/site-control/evaluation.ts';
export * from './src/client/features/inspections/geometry/evaluation.ts';
export * from './src/client/app/construction.ts';
` }, bundle: true, write: false, platform: "node", format: "esm" });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const earth = { earthStage: "final", soil: "ordinary", location: "foundation", excavationMethod: "hydraulic" };
const criterion = (min, max) => ({ min, max, reference: "Synthetic drawing A / rev 2 / clause 3", confirmed: true });

test("earthwork limits follow stage and method and close at the revision boundary", () => {
  const resolve = (context, date = "2026-11-14") => api.automaticCriteria("geo", "excavation", context, date);
  const final = resolve(earth);
  assert.deepEqual(final.limits.geoHeight, { min: -50, max: 50 });
  assert.equal(final.rules.geoHeight.minimumCount, 10);
  assert.deepEqual(resolve({ ...earth, earthStage: "rough", excavationMethod: "dragline" }).limits.geoHeight, { min: 0, max: 250 });
  assert.equal(resolve({ ...earth, soil: "rock" }).rules.geoHeight, undefined);
  for (const date of ["2026-02-30", "2027-03-01", "2024-12-01"]) assert.equal(resolve(earth, date).confirmed, false);
  assert.equal(resolve(earth, "2027-02-28").confirmed, true);
  assert.equal(api.compareMeasurement(0, 50, "geoHeight", final), "ok");
  assert.equal(api.compareMeasurement(0, 50.01, "geoHeight", final), "exceeded");
});

test("a project criterion cannot weaken fixed or formula-based normative bounds", () => {
  const context = { technology: "monolithic", stage: "completed", controlComplete: "yes" };
  const criteria = api.automaticCriteria("geometry", "beam", context, "2026-11-14", { section: criterion(-100, 100), length: criterion(-100, 100) });
  const section = api.parameterCriteria(criteria, "section", 300);
  assert.deepEqual(section.limits.section, { min: -6, max: 8.5 });
  assert.equal(api.comparePhysicalMeasurement(300, 309, "section", section), "exceeded");
  assert.deepEqual(api.parameterCriteria(criteria, "length", 6000).limits.length, { min: -20, max: 20 });
  const snapshot = JSON.parse(JSON.stringify(criteria));
  snapshot.rules.section.max = 999;
  assert.deepEqual(api.parameterCriteria(snapshot, "section", 300).limits.section, section.limits.section);
  assert.equal(api.automaticCriteria("geometry", "beam", {}, "2026-11-14", { length: criterion(-10, 10) }).confirmed, false);
});

test("preparation is supported without borrowing foundation tolerances and old excavation identities survive", () => {
  assert.equal(api.getConstructionCategoryKey("excavation"), "earthworks");
  assert.equal(api.normalizeConstructionKey("Котлован"), "excavation");
  assert.equal(api.isConstructionSupportedInModule("concrete_preparation", "geometry"), true);
  const criteria = api.automaticCriteria("geometry", "concrete_preparation", { technology: "monolithic", stage: "completed", controlComplete: "yes" }, "2026-11-14");
  assert.deepEqual(criteria.rules, {});
  assert.notEqual(api.evaluateGeometryCheck({ construction: "concrete_preparation", acceptanceCriteria: criteria, physicalDimensions: { length: { project: 1000, actual: 1000 }, width: { project: 1000, actual: 1000 } } }).status, "ok");
});

test("complete elevations cannot conceal missing soil acceptance, point coverage, or damaged soil", () => {
  const elevationCriteria = api.automaticCriteria("geo", "excavation", earth, "2026-11-14");
  const project = Object.fromEntries(["depth", "sideNorth", "sideSouth", "sideEast", "sideWest"].map(key => [key, criterion(-5, 5)]));
  const criteria = api.automaticCriteria("geometry", "excavation", earth, "2026-11-14", project);
  const fields = { drawing: "A", axes: "1-2/A-B", soilDescription: "sand", baseType: "natural", surveyComplete: "yes", matchesSurvey: "yes", noWashout: "yes", noSoftening: "yes", noLoosening: "yes", noFreezing: "yes", inspectionAct: "Act 1, 2026-11-14, Engineer", testsRequired: "no" };
  const points = [...Array.from({ length: 10 }, (_, n) => ({ id: String(n), label: `P${n}`, parameter: "geoHeight", project: "10", actual: "10.05" })), ...Object.keys(project).map(key => ({ id: key, label: key, parameter: key, project: "100", actual: "100" }))];
  const site = { version: 1, fields, points, elevationCriteria };
  assert.equal(api.evaluateSiteControl("excavation", site, criteria).status, "ok");
  assert.equal(api.evaluateSiteControl("excavation", { ...site, points: points.slice(1) }, criteria).status, "empty");
  assert.equal(api.evaluateSiteControl("excavation", { ...site, fields: { ...fields, noFreezing: "" } }, criteria).status, "empty");
  assert.equal(api.evaluateSiteControl("excavation", { ...site, fields: { ...fields, affectedLayerMm: "31" } }, criteria).status, "exceeded");
  assert.equal(api.evaluateSiteControl("excavation", { ...site, fields: { ...fields, baseType: "artificial" } }, criteria).status, "empty");
});
