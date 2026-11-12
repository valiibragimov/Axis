import { t } from "../../shared/i18n/index.js";

const sections = ["geo", "geometry", "reinforcement", "strength"] as const;
export type InspectionSection = typeof sections[number];
type Mode = "new" | "edit" | "repeat" | "saved";

const getSection = (id: InspectionSection) => globalThis.document?.getElementById(id);
const saves = new Set<InspectionSection>();

export function markInspectionMode(id: InspectionSection, mode: Mode) {
  const section = getSection(id);
  if (!section) return;
  section.dataset.inspectionMode = mode;
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

export function beginRepeatInspection(id: InspectionSection) {
  const section = getSection(id);
  if (!section) return;
  const form = section.querySelector('[data-step="2"]');
  for (const input of actualFields(form)) {
    if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = false;
    else input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const result = form?.querySelector<HTMLElement>(".result");
  if (result) result.textContent = "";
  const assessment = form?.querySelector<HTMLSelectElement>("#strengthAssessmentVerdict");
  if (assessment) assessment.value = "";
  markInspectionMode(id, "repeat");
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

export function setInspectionHistoryMetadata(row: HTMLElement, record: { createdAt?: unknown; floor?: unknown; location?: unknown }, status: unknown) {
  row.dataset.inspectionStatus = ["ok", "exceeded", "bad"].includes(String(status))
    ? (status === "ok" ? "ok" : "exceeded") : "pending";
  const time = Number(record.createdAt);
  const title = row.querySelector(".node-title");
  const titleText = row.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
  const location = String(record.location ?? "").trim();
  const parts = location && !titleText.includes(location.toLowerCase()) ? [location] : [];
  const floor = String(record.floor ?? "").trim();
  const floorText = floor ? `${t("form_floor")} ${floor}` : "";
  if (floorText && !titleText.includes(floorText.toLowerCase())) parts.unshift(floorText);
  if (Number.isFinite(time) && time > 0 && time <= 8.64e15) {
    const date = new Date(time).toLocaleDateString(row.ownerDocument.documentElement?.lang || "ru");
    if (!titleText.includes(date)) parts.push(date);
  }
  if (parts.length) {
    const meta = row.ownerDocument.createElement("div");
    meta.className = "inspection-history-meta";
    meta.textContent = parts.join(", ");
    title?.append(meta);
  }
  const open = row.querySelector(".node-open-button");
  if (open) {
    const action = row.ownerDocument.createElement("span");
    action.className = "inspection-history-edit";
    action.dataset.i18n = "inspection_edit_action";
    action.textContent = t("inspection_edit_action");
    open.setAttribute("aria-label", [action.textContent, title?.textContent?.trim()].filter(Boolean).join(" · "));
    open.replaceChildren(action);
  }
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
