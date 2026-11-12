export interface AcceptanceCriteria {
  reference: string;
  confirmed: boolean;
  normativeRule?: string;
  effectiveOn?: string;
  hoopsSectionMm?: number;
  coverSectionMm?: number;
  limits: Record<string, { min: number | null; max: number | null }>;
}

export function measurementNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

export function confirmedMeasurementLimit(criteria: AcceptanceCriteria | null | undefined, key: string) {
  const limits = criteria?.limits?.[key];
  if (!criteria?.confirmed || typeof criteria.reference !== "string" || !criteria.reference.trim() || limits?.min == null || limits.max == null ||
      !Number.isFinite(limits.min) || !Number.isFinite(limits.max) || limits.min > limits.max) return null;
  return { min: limits.min, max: limits.max };
}

/** Limits are signed deviations in mm, explicitly supplied for this inspection. */
export function compareMeasurement(project: unknown, actual: unknown, key: string, criteria?: AcceptanceCriteria | null) {
  const design = measurementNumber(project);
  const measured = measurementNumber(actual);
  if (design == null || measured == null) return "incomplete" as const;
  const limits = confirmedMeasurementLimit(criteria, key);
  if (!limits) return "unverified" as const;
  const delta = measured - design;
  return delta >= limits.min - 1e-7 && delta <= limits.max + 1e-7 ? "ok" as const : "exceeded" as const;
}

/** Physical dimensions, bar spacing and cover must be strictly positive. */
export function comparePhysicalMeasurement(project: unknown, actual: unknown, key: string, criteria?: AcceptanceCriteria | null) {
  const p = measurementNumber(project), a = measurementNumber(actual);
  return p == null || a == null || p <= 0 || a <= 0 ? "incomplete" as const : compareMeasurement(p, a, key, criteria);
}

export function summarizeMeasurements(results: Array<ReturnType<typeof compareMeasurement>>) {
  const status = results.includes("exceeded") ? "exceeded" : results.length > 0 && results.every(result => result === "ok") ? "ok" : "empty";
  const hasIncompleteMeasurements = results.length === 0 || results.some(result => result === "incomplete" || result === "unverified");
  const hasUnverifiedMeasurements = results.includes("unverified");
  return { status, hasIncompleteMeasurements, hasUnverifiedMeasurements, summaryText: status === "ok" ? "в норме" : status === "exceeded" ? hasIncompleteMeasurements ? "превышено; проверка неполна или не подтверждена" : "превышено" : hasUnverifiedMeasurements ? "Нет применимого допуска" : "Недостаточно измерений" } as const;
}
