import { measurementNumber } from "../acceptance.js";

export interface AxisIntersection {
  id: string;
  label: string;
  system: string;
  unit: "m" | "mm";
  source: string;
  x: number;
  y: number;
  criterion: { maxMm: number; reference: string } | null;
}

export interface AxisObservation {
  version: 1;
  point: AxisIntersection;
  x: number;
  y: number;
  evidence: string;
  dx: number;
  dy: number;
  distance: number;
}

export function evaluateAxisIntersection(point: AxisIntersection, xValue: unknown, yValue: unknown, evidence: string) {
  const x = measurementNumber(xValue);
  const y = measurementNumber(yValue);
  if (x == null || y == null || !evidence.trim()) return null;
  const scale = point.unit === "m" ? 1000 : 1;
  const dx = (x - point.x) * scale;
  const dy = (y - point.y) * scale;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance)) return null;
  const criterion = point.criterion;
  const status = criterion && criterion.maxMm > 0 && Number.isFinite(criterion.maxMm) && criterion.reference.trim()
    ? distance <= criterion.maxMm + 1e-7 ? "ok" : "bad"
    : "pending";
  const observation: AxisObservation = { version: 1, point, x, y, evidence: evidence.trim(), dx, dy, distance };
  return { observation, status } as const;
}

export function axisObservationText(observation: AxisObservation) {
  const { dx, dy, distance, point } = observation;
  const bounds = point.criterion ? `0…${point.criterion.maxMm} мм · ${point.criterion.reference}` : "Предел для точки не задан в ППГР или РД";
  return `ΔX ${dx.toFixed(2)} мм · ΔY ${dy.toFixed(2)} мм · Смещение ${distance.toFixed(2)} мм · ${bounds}`;
}
