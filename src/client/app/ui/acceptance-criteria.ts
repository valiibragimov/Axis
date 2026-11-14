import { localInspectionDate, type NormativeModule } from "../../features/inspections/normative-rules.js";
import { automaticCriteria, parameterCriteria } from "../../features/inspections/automatic-rules.js";
import { measurementNumber, type AcceptanceCriteria, type ProjectCriterion } from "../../features/inspections/acceptance.js";
import { getConstructionCategoryKey } from "../construction.js";

const automated = new WeakMap<Element, { module: NormativeModule; construction: () => string }>();
const restored = new WeakMap<Element, AcceptanceCriteria>();
const conditions = [
  ["controlComplete", "Обязательные измерения, технический осмотр и документы по РД завершены", "yes:Да, подтверждено инженером|no:Нет, контроль не завершён", "structure"],
  ["technology", "Технология", "monolithic:Монолитный бетон / железобетон|precast:Сборная конструкция|other:Другая", "structure"],
  ["stage", "Стадия конструкции", "completed:Готовая конструкция|in_progress:В процессе работ", "geometry"],
  ["support", "Опирающиеся элементы", "monolithic:Монолитное перекрытие|precast_beams:Сборные балки|other:Другие", "vertical"],
  ["verticalScope", "Область измерения вертикальности", "full_height:Вся высота элемента|local:Отдельный участок", "vertical"],
  ["surface", "Назначение поверхности", "bearing_steel_precast:Опора стального или сборного элемента|other:Другое", "geo"],
  ["positioning", "Измеряемое положение", "lower_marks:Риски нижнего сечения; X/Y вдоль осей рисок|other:Другое", "geo"],
  ["reinforcement", "Соединение арматуры", "tied:Вязаный каркас / сетка|welded:Сварной каркас / сетка", "reinforcement"],
  ["coverSectionMm", "Размер сечения по направлению замера защитного слоя, мм", "", "reinforcement"],
  ["hoopsSectionMm", "Высота сечения для хомутов, мм", "", "reinforcement"],
  ["earthStage", "Этап земляных работ", "rough:Черновая разработка|final:Окончательная разработка|acceptance:Приёмка основания", "earth"],
  ["soil", "Условия грунта", "ordinary:Нескальный, невалунный, немноголетнемёрзлый|rock:Скальный|boulders:Валунный|permafrost:Многолетнемёрзлый", "earth"],
  ["location", "Участок дна", "foundation:Место устройства фундамента / укладки конструкции|other:Другой участок", "earth"],
  ["excavationMethod", "Способ разработки", "dragline:Механический драглайн|front_shovel:Механическая прямая лопата|backhoe:Механическая обратная лопата|hydraulic:Гидравлический экскаватор с зубьями|grading:Планировочное / зачистное оборудование|bulldozer:Бульдозер|trencher:Траншейный экскаватор|scraper:Скрепер|other:Другой способ", "earth"]
];
const labels: Record<string, string> = { length: "Длина", width: "Ширина", height: "Высота", clearLength: "Длина в свету", clearWidth: "Ширина в свету", diameter: "Диаметр", depth: "Глубина", sideNorth: "Сторона 1", sideSouth: "Сторона 2", sideEast: "Сторона 3", sideWest: "Сторона 4", geoHeight: "Отметка, мм", geoPlan: "Положение в плане, мм" };

export function mountAcceptanceCriteria(root: HTMLElement, keys: Array<{ key: string; label: string }>, automatic?: { module: NormativeModule; construction: () => string }) {
  if (root.querySelector("[data-acceptance]") || !automatic) return;
  const panel = document.createElement("details"); panel.className = "card"; panel.dataset.acceptance = ""; panel.open = true;
  automated.set(panel, automatic);
  const summary = document.createElement("summary"); summary.textContent = "Условия работ и автоматическая оценка"; panel.append(summary);
  const field = (parent: HTMLElement, title: string, type: string) => {
    const label = document.createElement("label"); label.textContent = title;
    const input = document.createElement("input"); input.type = type; input.step = "any";
    label.append(input); parent.append(label); return input;
  };
  const date = field(panel, "Дата проверки", "date"); date.dataset.normativeDate = ""; date.value = localInspectionDate(); date.max = date.value;
  const fields = document.createElement("div"); fields.className = "grid-2"; panel.append(fields);
  for (const [key, title, options, scope] of conditions) {
    const label = document.createElement("label"); label.textContent = title; label.dataset.scope = scope;
    let input: HTMLInputElement | HTMLSelectElement;
    if (options) {
      input = document.createElement("select"); input.add(new Option("Укажите данные", ""));
      for (const item of options.split("|")) { const [value, text] = item.split(":"); input.add(new Option(text, value)); }
    } else { input = document.createElement("input"); input.type = "number"; input.min = "1"; }
    input.dataset.condition = key; if (key === "controlComplete") input.dataset.side = "actual"; label.append(input); fields.append(label);
  }
  const guidance = document.createElement("p"); guidance.setAttribute("aria-live", "polite"); panel.append(guidance);
  const special = document.createElement("details"); const heading = document.createElement("summary"); heading.textContent = "Документированные требования РД"; special.append(heading);
  const note = document.createElement("p"); note.textContent = "Укажите конкретный чертёж, редакцию и пункт. Требования РД не ослабляют применимую норму."; special.append(note);
  const parameters = automatic.module === "geometry" ? [...keys.filter(k => k.key !== "dimensions"), ...Object.entries(labels).map(([key, label]) => ({ key, label }))] : keys;
  for (const { key, label } of parameters) {
    const group = document.createElement("fieldset"); group.dataset.limit = key;
    const legend = document.createElement("legend"); legend.textContent = label; group.append(legend);
    field(group, "Чертёж, редакция, пункт", "text").dataset.reference = "";
    field(group, "Нижнее отклонение по РД, мм", "number").dataset.bound = "min";
    field(group, "Верхнее отклонение по РД, мм", "number").dataset.bound = "max";
    const confirmation = field(group, "Проверено по указанной РД", "checkbox"); confirmation.dataset.confirmed = "";
    group.addEventListener("input", event => { if (event.target !== confirmation) confirmation.checked = false; }); special.append(group);
  }
  panel.append(special);
  const refresh = () => {
    const construction = automatic.construction(); const earth = construction === "excavation";
    fields.querySelectorAll<HTMLElement>("[data-scope]").forEach(label => {
      const scope = label.dataset.scope;
      label.hidden = scope === "earth" ? !earth : earth || construction === "concrete_preparation" || construction === "formwork" ||
        (scope === "vertical" ? automatic.module !== "geometry" || !["wall", "column"].includes(construction) : scope !== "structure" && scope !== automatic.module);
    });
    const criteria = readAcceptanceCriteria(panel.parentElement);
    guidance.textContent = [criteria.reference || "Недостаточно данных. Укажите условия работ; для остальных параметров нужны подтверждённые требования РД.", ...(criteria.missing || [])].join(". ");
  };
  for (const event of ["input", "change"]) panel.addEventListener(event, () => { restored.delete(panel); refresh(); });
  document.getElementById("construction")?.addEventListener("change", () => { restored.delete(panel); refresh(); });
  const headingElement = root.querySelector(".inspection-form-title"); if (headingElement) headingElement.after(panel); else root.prepend(panel);
  refresh();
}

export function readAcceptanceCriteria(root: ParentNode | null): AcceptanceCriteria {
  const panel = root?.querySelector("[data-acceptance]"); const automatic = panel && automated.get(panel);
  if (!panel || !automatic) return { reference: "", confirmed: false, limits: {} };
  const saved = restored.get(panel); if (saved) return structuredClone(saved);
  const context: Record<string, string> = {};
  context.category = getConstructionCategoryKey(automatic.construction());
  context.subtype = document.getElementById("construction")?.dataset.subtypeKey || "";
  panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-condition]").forEach(input => { if (!input.closest("label")?.hidden) context[input.dataset.condition!] = input.value; });
  const project: Record<string, ProjectCriterion> = {};
  panel.querySelectorAll<HTMLElement>("[data-limit]").forEach(group => {
    project[group.dataset.limit!] = { reference: group.querySelector<HTMLInputElement>("[data-reference]")?.value.trim() || "", confirmed: group.querySelector<HTMLInputElement>("[data-confirmed]")?.checked === true,
      min: measurementNumber(group.querySelector<HTMLInputElement>('[data-bound="min"]')?.value), max: measurementNumber(group.querySelector<HTMLInputElement>('[data-bound="max"]')?.value) };
  });
  const date = panel.querySelector<HTMLInputElement>("[data-normative-date]")?.value || "";
  const criteria = automaticCriteria(automatic.module, automatic.construction(), context, date <= localInspectionDate() ? date : "", project);
  for (const key of Object.keys(criteria.limits)) criteria.limits[key] = parameterCriteria(criteria, key, null)?.limits[key] || { min: null, max: null };
  return criteria;
}

export function restoreAcceptanceCriteria(root: ParentNode | null, criteria?: AcceptanceCriteria | null) {
  const panel = root?.querySelector("[data-acceptance]"); if (!panel) return; restored.delete(panel);
  const date = panel.querySelector<HTMLInputElement>("[data-normative-date]"); if (date) date.value = criteria?.effectiveOn || localInspectionDate();
  panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-condition]").forEach(input => { input.value = criteria?.context?.[input.dataset.condition!] || ""; });
  panel.querySelectorAll<HTMLElement>("[data-limit]").forEach(group => {
    const value = criteria?.projectCriteria?.[group.dataset.limit!];
    const reference = group.querySelector<HTMLInputElement>("[data-reference]"); if (reference) reference.value = value?.reference || "";
    const confirmed = group.querySelector<HTMLInputElement>("[data-confirmed]"); if (confirmed) confirmed.checked = value?.confirmed === true;
    for (const bound of ["min", "max"] as const) { const input = group.querySelector<HTMLInputElement>(`[data-bound="${bound}"]`); if (input) input.value = String(value?.[bound] ?? ""); }
  });
  panel.dispatchEvent(new Event("change"));
  if (criteria) {
    restored.set(panel, structuredClone(criteria));
    const guidance = panel.querySelector<HTMLElement>('[aria-live="polite"]');
    if (guidance) guidance.textContent = `Сохранённое основание: ${criteria.reference || "не подтверждено"}. Версия: ${criteria.normativeRule || "проектный критерий прежней записи"}. Изменение условий сформирует новую оценку.`;
  }
}
