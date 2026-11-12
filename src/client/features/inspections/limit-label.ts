import { t } from "../../shared/i18n/index.js";
import { confirmedMeasurementLimit, type AcceptanceCriteria } from "./acceptance.js";

export function inspectionLimitLabel(criteria: AcceptanceCriteria | null | undefined, key: string) {
  const limit = confirmedMeasurementLimit(criteria, key);
  if (!limit) return t(criteria?.confirmed && typeof criteria.reference === "string" && criteria.reference.trim()
    ? "assessment_no_applicable_limit" : "assessment_basis_unconfirmed");
  return `${t("inspection_applied_limit")} ${limit.min} … ${limit.max} ${t("form_mm")} · ${criteria?.reference}`;
}
