import { localInspectionDate } from "./normative-rules.js";
import { getConstructionCategoryLabel, getConstructionLabel } from "../../app/construction.js";
import { t, translateEngineeringLabel } from "../../shared/i18n/index.js";

const sections = ["geo", "geometry", "reinforcement", "strength"] as const;
export type InspectionSection = typeof sections[number];
type Mode = "new" | "edit" | "repeat" | "saved";

const getSection = (id: InspectionSection) => globalThis.document?.getElementById(id);
const saves = new Set<InspectionSection>();

export function markInspectionMode(id: InspectionSection, mode: Mode) {
  const section = getSection(id);
  if (!section) return;
  section.dataset.inspectionMode = mode;
  if (mode !== "repeat") delete section.dataset.repeatSourceId;
  delete section.dataset.inspectionDirty;
}

export function canReplaceInspection(id: InspectionSection) {
  if (saves.size) return false;
  const section = getSection(id);
  if (!section?.dataset.inspectionDirty) return true;
  if (!window.confirm(t("inspection_discard"))) return false;
  delete section.dataset.inspectionDirty;
  return true;
}

export function canReplaceInspectionProject() {
  return !saves.size && (!sections.some(id => getSection(id)?.dataset.inspectionDirty) || window.confirm(t("inspection_discard")));
}

export function resetInspectionModes() {
  for (const id of sections) markInspectionMode(id, "new");
}

export function startNewInspection(id: InspectionSection) {
  if (!canReplaceInspection(id)) return false;
  markInspectionMode(id, "new");
  return true;
}

export function getInspectionMode(id: InspectionSection) {
  return getSection(id)?.dataset.inspectionMode;
}

function isActualField(input: HTMLInputElement | HTMLTextAreaElement) {
  return input.dataset.side === "actual" || /fact|actual|vert(?:ical)?dev|labreadings/i.test(
    [input.id, input.dataset.field, input.name, input.className].join(" ")
  );
}

function actualFields(form: Element | null | undefined) {
  return Array.from(form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea") || [])
    .filter(isActualField);
}

export function beginRepeatInspection(id: InspectionSection, sourceId: string) {
  const section = getSection(id);
  if (!section) return;
  const form = section.querySelector('[data-step="2"]');
  for (const input of actualFields(form)) {
    if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = false;
    else input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const date = form?.querySelector<HTMLInputElement>("[data-normative-date]");
  if (date) {
    date.value = localInspectionDate();
    date.dispatchEvent(new Event("change"));
  }
  const result = form?.querySelector<HTMLElement>(".result");
  if (result) result.textContent = "";
  const assessment = form?.querySelector<HTMLSelectElement>("#strengthAssessmentVerdict");
  if (assessment) assessment.value = "";
  markInspectionMode(id, "repeat");
  section.dataset.repeatSourceId = sourceId;
}

export function focusInspectionMode(id: InspectionSection) {
  const section = getSection(id);
  section?.querySelector<HTMLButtonElement>('[data-wizard-step="2"]')?.click();
  const mode = section?.querySelector<HTMLElement>(".inspection-mode");
  mode?.focus();
}

export async function serializeInspectionSave<T>(id: InspectionSection, save: () => Promise<T>) {
  const mode = getInspectionMode(id);
  if (saves.has(id) || mode === "saved") return;
  const section = getSection(id);
  if (mode === "repeat") {
    const fields = actualFields(section?.querySelector('[data-step="2"]')).filter(input =>
      !input.disabled && !input.readOnly &&
      !(input instanceof HTMLInputElement && input.type === "checkbox")
    );
    if (!fields.some(input => input.value.trim())) {
      const result = section?.querySelector<HTMLElement>(".result");
      if (result) {
        result.style.display = "";
        result.textContent = t("inspection_repeat_measurement_required");
      }
      fields.find(input => input.getClientRects().length > 0)?.focus();
      return;
    }
  }
  saves.add(id);
  const revision = section?.dataset.inspectionRevision;
  try {
    return await save();
  } finally {
    if (section && revision !== section.dataset.inspectionRevision) {
      section.dataset.inspectionDirty = "true";
    }
    saves.delete(id);
  }
}

interface InspectionHistoryRecord {
  createdAt?: unknown;
  floor?: unknown;
  location?: unknown;
  construction?: unknown;
  constructionCategory?: unknown;
  constructionType?: unknown;
  constructionLabel?: unknown;
  measurementScope?: unknown;
  repeatOf?: unknown;
}

export function inspectionOrigin(section: InspectionSection, previous?: InspectionHistoryRecord | null): { repeatOf?: string | null } {
  const sourceId = getSection(section)?.dataset.repeatSourceId;
  if (sourceId) return { repeatOf: sourceId };
  if (!previous) return { repeatOf: null };
  if (typeof previous.repeatOf === "string") return { repeatOf: previous.repeatOf };
  return previous.repeatOf === null ? { repeatOf: null } : {};
}

export function setInspectionHistoryMetadata(row: HTMLElement, record: InspectionHistoryRecord, status: unknown, section: InspectionSection) {
  row.dataset.inspectionStatus = ["ok", "exceeded", "bad"].includes(String(status))
    ? (status === "ok" ? "ok" : "exceeded") : "pending";
  const title = row.querySelector(".node-title");
  if (!title) return;
  const time = Number(record.createdAt);
  const currentText = row.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
  const kind = section === "geo" ? (record.measurementScope === "height" ? "history_bearing_level" : "history_coordinates") :
    section === "geometry" ? "history_geometry" : section === "reinforcement" ? "history_reinforcement" : "history_strength";
  const constructionKey = String(record.construction || record.constructionType || "");
  const construction = translateEngineeringLabel(String(record.constructionLabel || getConstructionLabel(constructionKey) || ""));
  const category = translateEngineeringLabel(getConstructionCategoryLabel(String(record.constructionCategory || constructionKey)) || "");
  const location = String(record.location ?? "").trim();
  const floor = record.floor ? `${t("form_floor")} ${record.floor}` : "";
  const date = Number.isFinite(time) && time > 0 && time <= 8.64e15
    ? new Date(time).toLocaleDateString(row.ownerDocument.documentElement?.lang || "ru") : "";
  const origin = record.repeatOf ? t("history_repeat") : record.repeatOf === null ? t("history_primary") : "";
  const meta = row.ownerDocument.createElement("div");
  meta.className = "inspection-history-meta";
  const parts = [...new Set([construction, category, floor, location, date].filter(value => value && !currentText.includes(value.toLowerCase())))];
  meta.textContent = [t(kind), ...parts, origin].filter(Boolean).join(" · ");
  const button = title.querySelector(".node-open-button");
  if (button) button.setAttribute("aria-label", [button.textContent?.trim(), meta.textContent].filter(Boolean).join(" · "));
  title.append(meta);
}

export function bindInspectionForms() {
  for (const id of sections) {
    const section = getSection(id);
    const list = section?.querySelector<HTMLElement>('[data-step="1"] .nodes');
    const search = section?.querySelector<HTMLInputElement>("[data-inspection-search]");
    const status = section?.querySelector<HTMLSelectElement>("[data-inspection-status-filter]");
    const empty = section?.querySelector<HTMLElement>("[data-inspection-no-matches]");
    if (!section || !list || !search || !status || !empty) continue;
    const filter = () => {
      const query = search.value.toLocaleLowerCase().trim();
      let rows = 0, matches = 0;
      for (const row of list.querySelectorAll<HTMLElement>(":scope > [data-inspection-status]")) {
        rows++;
        row.hidden = Boolean((status.value && row.dataset.inspectionStatus !== status.value) ||
          (query && !row.textContent?.toLocaleLowerCase().includes(query)));
        if (!row.hidden) matches++;
      }
      for (const heading of list.querySelectorAll<HTMLElement>(":scope > .strength-group-title")) {
        let row = heading.nextElementSibling;
        let hasVisibleRow = false;
        while (row instanceof HTMLElement && row.dataset.inspectionStatus) {
          hasVisibleRow ||= !row.hidden;
          row = row.nextElementSibling;
        }
        heading.hidden = !hasVisibleRow;
      }
      empty.hidden = rows === 0 || matches > 0;
    };
    search.addEventListener("input", filter);
    status.addEventListener("change", filter);
    new MutationObserver(filter).observe(list, { childList: true });
    const markDirty = (event: Event) => {
      if (section.inert || !event.isTrusted || !(event.target instanceof Element)) return;
      const target = event.target;
      if (event.type === "click") {
        if (!target.closest('button[id^="btnAdd"], [data-remove], [data-action="remove"], button[id*="BimSelection"], [data-bim-element-id]')) return;
      } else if (!target.matches("input, select, textarea") || !target.closest('[data-step="2"]')) return;
      section.dataset.inspectionDirty = "true";
      section.dataset.inspectionRevision = String(Number(section.dataset.inspectionRevision || 0) + 1);
      if (section.dataset.inspectionMode === "saved") section.dataset.inspectionMode = "new";
    };
    section.addEventListener("input", markDirty);
    section.addEventListener("click", markDirty, true);
  }
  window.addEventListener("beforeunload", event => {
    if (!sections.some(id => getSection(id)?.dataset.inspectionDirty) && !saves.size) return;
    event.preventDefault();
    event.returnValue = true;
  });
}
