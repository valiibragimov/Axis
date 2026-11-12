import { localInspectionDate, NORMATIVE_OPTIONS, RULESET, resolveNormativeCriteria, type NormativeModule } from "../../features/inspections/normative-rules.js";
import type { AcceptanceCriteria } from "../../features/inspections/acceptance.js";
import { measurementNumber } from "../../features/inspections/acceptance.js";
import { t } from "../../shared/i18n/index.js";

const automated = new WeakMap<Element, { module: NormativeModule; construction: () => string }>();

export function mountAcceptanceCriteria(root: HTMLElement, keys: Array<{ key: string; label: string }>,
  automatic?: { module: NormativeModule; construction: () => string }) {
  if (root.querySelector("[data-acceptance]")) return;
  const panel = document.createElement("details");
  panel.className = "card";
  panel.dataset.acceptance = "";
  const summary = document.createElement("summary");
  summary.dataset.i18n = "assessment_limits";
  summary.textContent = t("assessment_limits");
  panel.append(summary);
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.dataset.i18n = "assessment_reference";
  caption.textContent = t("assessment_reference");
  label.append(caption);
  const reference = document.createElement("textarea");
  reference.dataset.reference = "";
  reference.maxLength = 1000;
  label.append(reference);
  panel.append(label);
  for (const { key, label: title } of keys) {
    const group = document.createElement("fieldset");
    group.dataset.limit = key;
    const legend = document.createElement("legend");
    const labelKeys = { dimensions: "physical_dimensions", section: "dimension_section", thickness: "dimension_thickness", vertical: "form_vertical_deviation_mm", flatness: "form_measured_flatness_deviation_mm", geoFlatness: "form_measured_flatness_deviation_mm", opening: "dimension_opening", step: "dimension_step", cover: "form_design_concrete_cover", hoopsStep: "form_design_stirrup_spacing" };
    if (labelKeys[key]) legend.dataset.i18n = labelKeys[key];
    legend.textContent = title;
    group.append(legend);
    for (const bound of ["min", "max"]) {
      const caption = document.createElement("label");
      const text = document.createElement("span");
      text.dataset.i18n = bound === "min" ? "assessment_min" : "assessment_max";
      text.textContent = t(text.dataset.i18n);
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.dataset.bound = bound;
      caption.append(text, input);
      group.append(caption);
    }
    panel.append(group);
  }
  const confirmation = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.confirmed = "";
  const text = document.createElement("span");
  text.dataset.i18n = "assessment_confirmed";
  text.textContent = t("assessment_confirmed");
  confirmation.append(checkbox, text);
  panel.append(confirmation);
  // Changing the basis/limits invalidates the explicit confirmation.
  panel.addEventListener("input", event => { if (event.target !== checkbox) checkbox.checked = false; });
  if (automatic) {
    automated.set(panel, automatic);
    const manualFields = [...panel.children].slice(1);
    const context = document.createElement("select");
    context.dataset.normativeContext = "";
    const english = document.documentElement.lang === "en";
    context.setAttribute("aria-label", english ? "Inspection conditions" : "Условия проверки");
    context.add(new Option(english ? "Select conditions (SP without special design requirements)" : "Выберите условия (СП, без специальных требований проекта)", ""));
    for (const option of NORMATIVE_OPTIONS.filter(option => option.module === automatic.module)) {
      context.add(new Option(english ? option.en : option.ru, option.id));
    }
    context.add(new Option(english ? "Special requirements from the project" : "Специальные требования проекта", "project"));
    const dateLabel = document.createElement("label");
    dateLabel.append(t("assessment_inspection_date"));
    const date = document.createElement("input");
    date.type = "date";
    date.dataset.normativeDate = "";
    date.value = localInspectionDate();
    date.max = date.value;
    dateLabel.append(date);
    const dimensions = document.createElement("div");
    const addDimension = (key: string, label: string) => {
      const field = document.createElement("label");
      field.append(label);
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.dataset[key] = "";
      field.append(input);
      dimensions.append(field);
      return field;
    };
    const coverSize = automatic.module === "reinforcement" ? addDimension("coverSectionMm", t("assessment_cover_section")) : null;
    const hoopsSize = automatic.module === "reinforcement" ? addDimension("hoopsSectionMm", t("assessment_hoops_section")) : null;
    const guidance = document.createElement("p");
    guidance.setAttribute("aria-live", "polite");
    const refresh = () => {
      for (const child of manualFields) child.toggleAttribute("hidden", context.value !== "project");
      const construction = automatic.construction();
      const tied = context.value === "tied-longitudinal";
      dateLabel.hidden = !context.value || context.value === "project";
      if (coverSize) coverSize.hidden = !tied;
      if (hoopsSize) hoopsSize.hidden = !tied || !["column", "beam", "foundation_slab", "floor_slab"].includes(construction);
      const criteria = date.value <= localInspectionDate() ? resolveNormativeCriteria(automatic.module, construction, context.value, date.value) : null;
      guidance.textContent = context.value === "project" ? "" : criteria?.reference || t("assessment_conditions_missing");
    };
    context.addEventListener("change", refresh);
    date.addEventListener("change", refresh);
    document.getElementById("construction")?.addEventListener("change", refresh);
    panel.append(context, dateLabel, guidance);
    if (dimensions.childElementCount) panel.append(dimensions);
    if (automatic.module === "geo") {
      const accuracy = document.createElement("p");
      accuracy.className = "caption";
      accuracy.dataset.i18n = "assessment_survey_accuracy";
      accuracy.textContent = t("assessment_survey_accuracy");
      panel.append(accuracy);
    }
    refresh();
  }
  const heading = root.querySelector(".inspection-form-title");
  if (heading) heading.after(panel);
  else root.prepend(panel);
}

export function readAcceptanceCriteria(root: ParentNode | null): AcceptanceCriteria {
  const panel = root?.querySelector("[data-acceptance]");
  const automatic = panel && automated.get(panel);
  const context = panel?.querySelector<HTMLSelectElement>("[data-normative-context]");
  if (automatic && context?.value && context.value !== "project") {
    const effectiveOn = panel?.querySelector<HTMLInputElement>("[data-normative-date]")?.value;
    const resolved = effectiveOn && effectiveOn <= localInspectionDate()
      ? resolveNormativeCriteria(automatic.module, automatic.construction(), context.value, effectiveOn) : null;
    if (!resolved) return { reference: "", confirmed: false, limits: {} };
    const coverSectionMm = measurementNumber(panel?.querySelector<HTMLInputElement>("[data-cover-section-mm]")?.value);
    const hoopsSection = panel?.querySelector<HTMLInputElement>("[data-hoops-section-mm]");
    const hoopsSectionMm = hoopsSection?.closest("label")?.hidden ? null : measurementNumber(hoopsSection?.value);
    return { ...resolved, ...(coverSectionMm && { coverSectionMm }), ...(hoopsSectionMm && { hoopsSectionMm }) };
  }
  if (automatic && !context?.value) return { reference: "", confirmed: false, limits: {} };
  const limits: AcceptanceCriteria["limits"] = {};
  panel?.querySelectorAll<HTMLElement>("[data-limit]").forEach(group => {
    limits[group.dataset.limit!] = {
      min: measurementNumber(group.querySelector<HTMLInputElement>('[data-bound="min"]')?.value),
      max: measurementNumber(group.querySelector<HTMLInputElement>('[data-bound="max"]')?.value)
    };
  });
  return { reference: panel?.querySelector<HTMLTextAreaElement>("[data-reference]")?.value.trim() || "",
    confirmed: panel?.querySelector<HTMLInputElement>("[data-confirmed]")?.checked === true, limits };
}

export function restoreAcceptanceCriteria(root: ParentNode | null, criteria?: AcceptanceCriteria | null) {
  const panel = root?.querySelector("[data-acceptance]");
  const context = panel?.querySelector<HTMLSelectElement>("[data-normative-context]");
  const date = panel?.querySelector<HTMLInputElement>("[data-normative-date]");
  if (date) date.value = criteria?.effectiveOn || localInspectionDate();
  const cover = panel?.querySelector<HTMLInputElement>("[data-cover-section-mm]");
  if (cover) cover.value = String(criteria?.coverSectionMm ?? "");
  const hoops = panel?.querySelector<HTMLInputElement>("[data-hoops-section-mm]");
  if (hoops) hoops.value = String(criteria?.hoopsSectionMm ?? "");
  if (context) {
    context.value = criteria?.normativeRule?.startsWith(`${RULESET}/`) ? criteria.normativeRule.slice(RULESET.length + 1) : criteria?.reference ? "project" : "";
    context.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const reference = panel?.querySelector<HTMLTextAreaElement>("[data-reference]");
  if (reference) reference.value = criteria?.reference || "";
  const confirmed = panel?.querySelector<HTMLInputElement>("[data-confirmed]");
  if (confirmed) confirmed.checked = criteria?.confirmed === true;
  panel?.querySelectorAll<HTMLElement>("[data-limit]").forEach(group => {
    for (const bound of ["min", "max"] as const) {
      const input = group.querySelector<HTMLInputElement>(`[data-bound="${bound}"]`);
      if (input) input.value = String(criteria?.limits[group.dataset.limit!]?.[bound] ?? "");
    }
  });
}
