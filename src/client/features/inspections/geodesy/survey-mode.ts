import { readAcceptanceCriteria } from "../../../app/ui/acceptance-criteria.js";
import { measurementNumber } from "../acceptance.js";
import { inspectionLimitLabel } from "../limit-label.js";
import { loadAxisCatalog, saveAxisIntersection } from "./axis-catalog.js";
import { axisObservationText, evaluateAxisIntersection, type AxisIntersection } from "./axis-evaluation.js";
import { evaluateGeoNode, getConfirmedGeoTolerance } from "./evaluation.js";
import type { GeodesyNodeRecord } from "./types.js";

const section = () => document.getElementById("geo");
const mode = () => document.querySelector<HTMLSelectElement>("#geoSurveyMode");
const field = (key: string) => document.querySelector<HTMLInputElement>(
  key === "label" ? '#geoSurveyElement [name="label"]' : `#geoSurvey [name="${key}"]`
)!;
const value = (key: string) => field(key).value.trim();
const number = (key: string) => measurementNumber(value(key));
let restoredPoint: AxisIntersection | null = null;
let catalog: AxisIntersection[] = [];
let catalogProject: string | null = null;
let catalogGeneration = 0;

export function resetSurveyProject() {
  ++catalogGeneration;
  catalogProject = null;
  catalog = [];
  document.querySelector<HTMLSelectElement>("#geoAxisIntersection")?.replaceChildren(new Option("Выберите пересечение", ""));
  document.querySelector<HTMLFormElement>("#geoAxisCatalog")?.reset();
  restoreSurveyMode();
}

function clearObservedFields() {
  for (const key of ["actual1", "actual2", "evidence"]) field(key).value = "";
}

export function refreshSurveyMode(category: string) {
  const select = mode();
  const root = section();
  if (!select || !root) return;
  const foundation = category === "foundation";
  const binding = select.querySelector<HTMLOptionElement>('option[value="binding"]');
  if (binding) binding.disabled = category === "earthworks";
  if (select.value === "binding" && category === "earthworks") select.value = "height";
  const next = select.value === "binding" && foundation ? "foundation" : select.value;
  if (root.dataset.surveyMode !== next) {
    root.dataset.surveyMode = next;
    select.dispatchEvent(new Event("geo-survey-mode", { bubbles: true }));
  }
}

export function restoreSurveyMode(record?: GeodesyNodeRecord) {
  const select = mode();
  if (!select) return;
  restoredPoint = record?.axisObservation?.point ?? null;
  select.value = record?.surveyMode === "foundation" ? "binding" : record?.surveyMode ?? (record ? "legacy" : "binding");
  field("label").value = record?.axisObservation ? "" : record?.pointLabel ?? "";
  field("project1").value = String(record?.projH ?? record?.bindingOffsets?.project1 ?? "");
  field("project2").value = String(record?.bindingOffsets?.project2 ?? "");
  field("actual1").value = String(record?.axisObservation?.x ?? record?.factH ?? record?.bindingOffsets?.actual1 ?? "");
  field("actual2").value = String(record?.axisObservation?.y ?? record?.bindingOffsets?.actual2 ?? "");
  field("evidence").value = record?.axisObservation?.evidence ?? "";
  select.dispatchEvent(new Event("change"));
}

export function mountSurveyMode(getProject: () => string | null, getCategory: () => string, report: (message: string) => void) {
  const select = mode();
  if (!select) return;
  const pointSelect = document.querySelector<HTMLSelectElement>("#geoAxisIntersection")!;
  const editor = document.querySelector<HTMLFormElement>("#geoAxisCatalog")!;
  const card = document.getElementById("geoAxisDesign")!;
  const live = document.getElementById("geoSurveyPreview")!;
  let writing = false;

  const render = () => {
    refreshSurveyMode(getCategory());
    const scope = section()?.dataset.surveyMode;
    const point = restoredPoint ?? (catalogProject === getProject() ? catalog.find(item => item.id === pointSelect.value) : null);
    card.textContent = point ? `${point.label} · X ${point.x} · Y ${point.y} ${point.unit === "m" ? "м" : "мм"} · ${point.system} · ${point.source}` : "";
    document.querySelector<HTMLElement>("#geoSurveyActual1Label")!.textContent = scope === "axis" ? "Факт X" : scope === "height" ? "Факт H, м" : "Факт · от первой оси, м";
    document.querySelector<HTMLElement>("#geoSurveyActual2Label")!.textContent = scope === "axis" ? "Факт Y" : "Факт · от второй оси, м";
    document.querySelector<HTMLElement>("#geoSurveyProject1Label")!.textContent = scope === "height" ? "Проект H, м" : "Проект · от первой оси, м";
    const draft = readSurveyMode(getProject());
    live.textContent = draft ? `${draft.status === "ok" ? "Соответствует" : draft.status === "bad" ? "Превышено" : "Недостаточно данных для оценки"} · ${draft.summaryText}` :
      scope === "axis" && point?.criterion ? `Предел 0…${point.criterion.maxMm} мм · ${point.criterion.reference}` : "";
  };

  async function load(preferred = pointSelect.value) {
    const project = getProject();
    const request = ++catalogGeneration;
    if (!project) return;
    try {
      const points = await loadAxisCatalog(project);
      if (getProject() !== project || request !== catalogGeneration) return;
      const before = catalog.find(point => point.id === pointSelect.value);
      const after = points.find(point => point.id === preferred);
      if (!restoredPoint && JSON.stringify(before) !== JSON.stringify(after)) clearObservedFields();
      catalog = points;
      catalogProject = project;
      pointSelect.replaceChildren(new Option("Выберите пересечение", ""), ...points.map(point => new Option(`${point.label} · ${point.system}`, point.id)));
      pointSelect.value = preferred;
      render();
    } catch {
      if (request === catalogGeneration && getProject() === project) report("Не удалось загрузить каталог осей. Повторите попытку.");
    }
  }

  select.addEventListener("change", () => { render(); if (select.value === "axis") void load(); });
  select.addEventListener("input", () => {
    restoredPoint = null;
    const result = document.getElementById("geoResult");
    if (result) result.textContent = "";
    for (const key of ["label", "project1", "project2", "actual1", "actual2", "evidence"]) field(key).value = "";
  });
  pointSelect.addEventListener("focus", () => { if (catalogProject !== getProject()) void load(""); });
  pointSelect.addEventListener("change", () => {
    restoredPoint = null;
    clearObservedFields();
    render();
  });
  section()?.addEventListener("input", render);
  section()?.addEventListener("change", render);
  document.getElementById("construction")?.addEventListener("change", render);
  editor.addEventListener("submit", async event => {
    event.preventDefault();
    const project = getProject();
    if (!project || writing) return;
    const fields = new FormData(editor);
    const read = (key: string) => String(fields.get(key) ?? "").trim();
    const label = read("label");
    const system = read("system");
    const unit = read("unit") === "mm" ? "mm" : "m";
    const source = read("source");
    const x = measurementNumber(read("x")), y = measurementNumber(read("y"));
    const maxMm = measurementNumber(read("limit")), reference = read("reference");
    if (!label || !system || !source || x == null || y == null ||
      ((read("limit") || reference) && (maxMm == null || maxMm <= 0 || !reference))) {
      report("Укажите координаты и источник. Для предела нужны число больше нуля и пункт ППГР / РД.");
      return;
    }
    const id = encodeURIComponent(JSON.stringify([system.toUpperCase(), label.replace(/\s/g, "").toUpperCase()]));
    writing = true;
    try {
      await saveAxisIntersection(project, { id, label, system, unit, source, x, y, criterion: maxMm == null ? null : { maxMm, reference } });
      if (getProject() !== project) return;
      editor.reset();
      report("Проектное пересечение сохранено.");
      await load(restoredPoint ? pointSelect.value : id);
    } catch {
      if (getProject() === project) report("Не удалось сохранить проектное пересечение.");
    } finally { writing = false; }
  });
  render();
}

export function readSurveyMode(projectId: string | null): GeodesyNodeRecord | null {
  const scope = section()?.dataset.surveyMode;
  if (scope === "axis") {
    const selected = document.querySelector<HTMLSelectElement>("#geoAxisIntersection")?.value;
    const point = restoredPoint ?? (catalogProject === projectId ? catalog.find(item => item.id === selected) : null);
    const evaluated = point && evaluateAxisIntersection(point, value("actual1"), value("actual2"), value("evidence"));
    if (!evaluated) return null;
    const { observation, status } = evaluated;
    return {
      surveyMode: "axis", axisObservation: observation, pointLabel: `Оси · ${point.label} · ${point.system}`,
      status, dataStatus: "checked", summaryText: axisObservationText(observation),
      acceptanceCriteria: { confirmed: !!point.criterion, reference: point.criterion?.reference || "", limits: {} }
    };
  }
  if (scope !== "height" && scope !== "foundation") return null;
  const label = value("label");
  const project1 = number("project1"), actual1 = number("actual1");
  const project2 = number("project2"), actual2 = number("actual2");
  if (!label || project1 == null || actual1 == null || (scope === "foundation" && (project2 == null || actual2 == null))) return null;
  const criteria = readAcceptanceCriteria(section());
  const key = scope === "height" ? "geoHeight" : "geoPlan";
  const tolerance = getConfirmedGeoTolerance(criteria, key);
  const isHeight = scope === "height";
  const evaluation = isHeight
    ? evaluateGeoNode({ measurementScope: "height", projH: project1, factH: actual1, projX: null, factX: null, projY: null, factY: null }, NaN, tolerance)
    : evaluateGeoNode({ measurementScope: "plan", projX: project1, factX: actual1, projY: project2, factY: actual2, projH: null, factH: null }, tolerance);
  const sufficient = !isHeight || (criteria.rules?.geoHeight?.minimumCount ?? 0) <= 1;
  const summaryText = evaluation.details.map(detail => {
    const name = isHeight ? "H" : detail.axis === "X" ? "Первая ось" : "Вторая ось";
    const verdict = Number.isFinite(detail.tol) ? detail.ok ? "в пределах" : "превышено" : "не оценено";
    return `${name}: Δ ${detail.delta.toFixed(2)} мм · ${inspectionLimitLabel(criteria, key)} · ${verdict}`;
  }).join(" | ");
  return {
    surveyMode: scope, measurementScope: isHeight ? "height" : "coordinates", pointLabel: label,
    ...(isHeight ? { projH: project1, factH: actual1 } : { bindingOffsets: { project1, actual1, project2, actual2 } }),
    acceptanceCriteria: criteria, status: evaluation.status === "bad" ? "bad" : sufficient && evaluation.status === "ok" ? "ok" : "pending",
    dataStatus: "checked", summaryText: sufficient ? summaryText : `${summaryText} · Для приёмки нужен полный набор точек`
  };
}
