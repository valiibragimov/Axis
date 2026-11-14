import { readAcceptanceCriteria } from "../../../app/ui/acceptance-criteria.js";
import { automaticCriteria } from "../automatic-rules.js";
import type { SiteControl } from "./evaluation.js";
const restoredSites = new WeakMap<HTMLElement, SiteControl>();

const schemas = [
  ["drawing", "Чертёж, редакция и участок", "text", "both"], ["axes", "Оси и границы участка", "text", "both"],
  ["soilDescription", "Тип и описание грунта по ИГИ", "text", "earth"],
  ["baseType", "Основание", "natural:Естественное|artificial:Искусственное", "earth"],
  ["surveyComplete", "Объём и расположение точек по нормативу / РД выполнены", "verdict", "both"],
  ["matchesSurvey", "Напластование и свойства соответствуют ИГИ / проекту", "verdict", "earth"],
  ["noWashout", "Размыв отсутствует", "verdict", "earth"], ["noSoftening", "Размягчение отсутствует", "verdict", "earth"],
  ["noLoosening", "Разрыхление отсутствует", "verdict", "earth"], ["noFreezing", "Промерзание отсутствует", "verdict", "earth"],
  ["affectedLayerMm", "Толщина нарушенного верхнего слоя, мм", "number", "earth"],
  ["inspectionAct", "Акт осмотра основания, дата и ответственный", "text", "earth"],
  ["testsRequired", "По РД требуются лабораторные / полевые испытания", "verdict", "earth"],
  ["density", "Измеренная плотность, т/м³", "number", "earth"], ["compaction", "Измеренный коэффициент уплотнения", "number", "earth"],
  ["moisture", "Измеренная влажность, %", "number", "earth"],
  ["densityMin", "Минимальная плотность по РД, т/м³", "number", "earth"], ["densityMax", "Максимальная плотность по РД, т/м³", "number", "earth"],
  ["compactionMin", "Минимальный коэффициент уплотнения по РД", "number", "earth"], ["compactionMax", "Максимальный коэффициент уплотнения по РД", "number", "earth"],
  ["moistureMin", "Минимальная влажность по РД, %", "number", "earth"], ["moistureMax", "Максимальная влажность по РД, %", "number", "earth"],
  ["testCriteria", "Проектные критерии испытаний и пункт РД", "text", "earth"],
  ["testReport", "Протокол лабораторных / полевых испытаний", "text", "earth"], ["testsConform", "Испытания подтверждают требования РД", "verdict", "earth"],
  ["concreteClass", "Класс бетона по проекту", "text", "preparation"],
  ["preparationApplication", "Условия применения подготовки", "monolithic_nonrock:Под монолитным фундаментом, нескальное основание|rock:Скальное основание|other:Другое назначение по РД", "preparation"],
  ["qualityDocument", "Документ качества смеси (ГОСТ 7473 по дате поставки)", "text", "preparation"],
  ["strengthReport", "Протокол / запись контроля прочности, дата и ответственный", "text", "preparation"],
  ["strengthConforms", "Прочность подтверждена по ГОСТ 18105-2018", "verdict", "preparation"],
  ["preparationDesign", "Решение по подготовке проверено по СП 22, 4.25 и РД", "verdict", "preparation"]
];
const pointNames: Record<string, string> = { thickness: "Толщина, мм", depth: "Глубина, мм", geoHeight: "Отметка, м", sideNorth: "Сторона 1, привязка в мм", sideSouth: "Сторона 2, привязка в мм", sideEast: "Сторона 3, привязка в мм", sideWest: "Сторона 4, привязка в мм" };
function input(parent: HTMLElement, title: string, key: string, value = "", actual = false) {
  const label = document.createElement("label"); label.textContent = title;
  const field = document.createElement("input"); field.dataset.siteField = key; field.value = value;
  if (actual) field.dataset.side = "actual";
  label.append(field); parent.append(label); return field;
}
function addPoint(root: HTMLElement, point?: SiteControl["points"][number]) {
  const row = document.createElement("fieldset"); row.dataset.sitePoint = point?.id || crypto.randomUUID();
  const legend = document.createElement("legend"); legend.textContent = "Контрольная точка"; row.append(legend);
  input(row, "Обозначение точки / оси", "label", point?.label);
  const label = document.createElement("label"); label.textContent = "Параметр";
  const select = document.createElement("select"); select.dataset.siteField = "parameter";
  for (const [key, title] of Object.entries(pointNames)) select.add(new Option(title, key));
  select.value = point?.parameter || "geoHeight"; label.append(select); row.append(label);
  input(row, "Проектное значение", "project", point?.project).inputMode = "decimal";
  input(row, "Фактическое значение", "actual", point?.actual, true).inputMode = "decimal";
  const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Удалить точку"; remove.dataset.remove = "";
  remove.addEventListener("click", () => { row.remove(); root.dispatchEvent(new Event("input", { bubbles: true })); }); row.append(remove);
  root.querySelector("[data-site-points]")?.append(row);
}
export function mountSiteControl(root: HTMLElement, construction: string) {
  let panel = root.querySelector<HTMLElement>("[data-site-control]");
  const applicable = ["excavation", "concrete_preparation"].includes(construction);
  if (panel && panel.dataset.construction !== construction) { panel.remove(); panel = null; }
  if (!applicable || panel) return;
  panel = document.createElement("details"); panel.dataset.siteControl = ""; panel.dataset.construction = construction; panel.className = "card"; panel.setAttribute("open", "");
  const summary = document.createElement("summary"); summary.textContent = construction === "excavation" ? "Основание и контрольные точки котлована" : "Бетонная подготовка: точки и документы"; panel.append(summary);
  const hint = document.createElement("p"); hint.textContent = "Здесь — привязка каждой стороны, отметки и дополнительные измерения. Знак ΔH: плюс — недобор грунта, минус — перебор. Геометрия не заменяет приёмку основания или контроль прочности."; panel.append(hint);
  const grid = document.createElement("div"); grid.className = "grid-2"; panel.append(grid);
  const tests = document.createElement("details"); tests.dataset.soilTests = ""; tests.hidden = true;
  const testsHeading = document.createElement("summary"); testsHeading.textContent = "Лабораторные и полевые испытания по РД"; tests.append(testsHeading); panel.append(tests);
  for (const [key, title, kind, scope] of schemas) {
    if (scope !== "both" && scope !== (construction === "excavation" ? "earth" : "preparation")) continue;
    const parent = /^(density|compaction|moisture|testCriteria|testReport|testsConform)/u.test(key) ? tests : grid;
    if (kind === "text" || kind === "number") { const field = input(parent, title, key, "", ["density", "compaction", "moisture", "affectedLayerMm", "inspectionAct", "testReport", "qualityDocument", "strengthReport"].includes(key)); field.type = kind; field.step = "any"; }
    else {
      const label = document.createElement("label"); label.textContent = title;
      const select = document.createElement("select"); select.dataset.siteField = key; if (kind === "verdict") select.dataset.side = "actual";
      select.add(new Option("Не проверено / нет данных", ""));
      for (const item of (kind === "verdict" ? "yes:Да|no:Нет" : kind).split("|")) { const [value, text] = item.split(":"); select.add(new Option(text, value)); }
      label.append(select); parent.append(label);
    }
  }
  const points = document.createElement("div"); points.dataset.sitePoints = ""; panel.append(points);
  const add = document.createElement("button"); add.type = "button"; add.textContent = "+ Контрольная точка"; add.id = "btnAddSitePoint";
  const target = panel; add.addEventListener("click", () => addPoint(target)); panel.append(add);
  const result = root.querySelector("#geometryResult"); if (result) result.before(panel); else root.append(panel);
  const refreshTests = () => { tests.hidden = target.querySelector<HTMLSelectElement>('[data-site-field="baseType"]')?.value !== "artificial" && target.querySelector<HTMLSelectElement>('[data-site-field="testsRequired"]')?.value !== "yes"; };
  panel.addEventListener("input", refreshTests); panel.addEventListener("change", refreshTests);
  for (const key of [construction === "excavation" ? "depth" : "thickness", "geoHeight", "sideNorth", "sideSouth", "sideEast", "sideWest"]) addPoint(panel, { id: crypto.randomUUID(), parameter: key, label: "", project: "", actual: "" });
}
export function readSiteControl(root: HTMLElement, construction: string): SiteControl | undefined {
  const panel = root.querySelector<HTMLElement>("[data-site-control]"); if (!panel || panel.dataset.construction !== construction) return undefined;
  const fields: Record<string, string> = {};
  panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-site-field]").forEach(field => { if (!field.closest("[data-site-point]")) fields[field.dataset.siteField!] = field.value; });
  const points = Array.from(panel.querySelectorAll<HTMLElement>("[data-site-point]")).map(row => {
    const value = (key: string) => row.querySelector<HTMLInputElement>(`[data-site-field="${key}"]`)?.value || "";
    return { id: row.dataset.sitePoint!, label: value("label"), parameter: value("parameter"), project: value("project"), actual: value("actual") };
  });
  const criteria = readAcceptanceCriteria(root);
  const context = { ...criteria.context };
  if (context.earthStage === "acceptance") context.earthStage = "final";
  const previous = restoredSites.get(panel)?.elevationCriteria;
  const sameBasis = previous?.effectiveOn === criteria.effectiveOn && JSON.stringify(previous?.context) === JSON.stringify(context) && JSON.stringify(previous?.projectCriteria) === JSON.stringify(criteria.projectCriteria);
  return { version: 1, fields, points, elevationCriteria: sameBasis && previous ? structuredClone(previous) : automaticCriteria("geo", construction, context, criteria.effectiveOn || "", criteria.projectCriteria) };
}
export function restoreSiteControl(root: HTMLElement, construction: string, site?: SiteControl) {
  root.querySelector("[data-site-control]")?.remove(); mountSiteControl(root, construction);
  if (!site) return;
  const panel = root.querySelector<HTMLElement>("[data-site-control]"); if (!panel) return;
  restoredSites.set(panel, structuredClone(site));
  panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-site-field]").forEach(field => { if (!field.closest("[data-site-point]")) field.value = site.fields[field.dataset.siteField!] || ""; });
  panel.querySelector("[data-site-points]")?.replaceChildren(); site.points.forEach(point => addPoint(panel, point));
  panel.dispatchEvent(new Event("change"));
}
