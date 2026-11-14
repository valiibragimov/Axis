import { compareMeasurement, comparePhysicalMeasurement, measurementNumber, summarizeMeasurements, type AcceptanceCriteria } from "../acceptance.js";
import { parameterCriteria } from "../automatic-rules.js";

export interface SitePoint {
  id: string;
  label: string;
  project: string;
  actual: string;
  parameter: string;
}
export interface SiteControl {
  version: 1;
  fields: Record<string, string>;
  points: SitePoint[];
  elevationCriteria: AcceptanceCriteria;
}
export function evaluateSiteControl(construction: string, site: SiteControl | undefined, criteria?: AcceptanceCriteria | null) {
  const earth = construction === "excavation";
  const fields = site?.fields || {};
  const measurements: Array<{ label: string; key: string; project: number | null; actual: number | null; criteria: AcceptanceCriteria | null | undefined; status: ReturnType<typeof compareMeasurement> }> = [];
  const missing: string[] = [];
  const readiness: Array<ReturnType<typeof compareMeasurement>> = [];
  const geometricRequirements: Array<ReturnType<typeof compareMeasurement>> = [];
  const need = (key: string, title: string) => { if (!fields[key]?.trim()) { missing.push(title); readiness.push("incomplete"); } };
  const inspect = (key: string, title: string) => {
    const value = fields[key]; readiness.push(value === "yes" ? "ok" : value === "no" ? "exceeded" : "incomplete");
    if (value !== "yes" && value !== "no") missing.push(title);
  };
  need("drawing", "Чертёж и редакция РД");
  need("axes", "Оси и границы участка");
  inspect("surveyComplete", "Подтверждение объёма и расположения контрольных точек");
  if (earth) {
    for (const item of criteria?.missing || []) { missing.push(item); readiness.push("incomplete"); }
    need("soilDescription", "Описание грунта"); need("baseType", "Естественное или искусственное основание");
    inspect("matchesSurvey", "Соответствие грунта ИГИ и проекту");
    inspect("noWashout", "Осмотр на размыв");
    inspect("noSoftening", "Осмотр на размягчение");
    inspect("noLoosening", "Осмотр на разрыхление");
    inspect("noFreezing", "Осмотр на промерзание");
    const affected = measurementNumber(fields.affectedLayerMm);
    if (affected != null && affected > 30) readiness.push("exceeded");
    need("inspectionAct", "Акт осмотра основания (СП 45, 11.39–11.40)");
    if (fields.baseType === "artificial" || fields.testsRequired === "yes") {
      need("testReport", "Протокол лабораторных / полевых испытаний");
      need("testCriteria", "Требования РД к плотности, уплотнению и влажности");
      inspect("testsConform", "Подтверждение испытаний по РД (СП 45, раздел 17, приложение Н)");
      let tested = 0;
      for (const key of ["density", "compaction", "moisture"]) {
        const actual = measurementNumber(fields[key]), min = measurementNumber(fields[key + "Min"]), max = measurementNumber(fields[key + "Max"]);
        if (actual == null && min == null && max == null) continue;
        tested++;
        const valid = actual != null && (key === "moisture" ? actual >= 0 : actual > 0) && min != null && max != null && min >= 0 && min <= max;
        readiness.push(!valid ? "incomplete" : actual >= min && actual <= max ? "ok" : "exceeded");
        if (!valid) missing.push(`Испытания ${key}: фактическое значение и обе границы по РД`);
      }
      if (!tested) { readiness.push("incomplete"); missing.push("Численные результаты требуемых испытаний и проектные границы"); }
    } else if (fields.testsRequired !== "no") { missing.push("Необходимость испытаний по РД"); readiness.push("incomplete"); }
  } else {
    need("preparationApplication", "Условия применения подготовки по СП 22, 4.25");
    need("concreteClass", "Класс бетона по проекту"); need("qualityDocument", "Документ качества бетонной смеси");
    need("strengthReport", "Протокол контроля прочности / ссылка на проверку прочности");
    inspect("strengthConforms", "Подтверждение прочности по ГОСТ 18105-2018");
    inspect("preparationDesign", "Соответствие решения СП 22, 4.25, включая условия и исключения");
    if (fields.preparationApplication === "monolithic_nonrock") {
      const classValue = Number(fields.concreteClass?.replace(/^[ВB]/iu, "").replace(",", "."));
      if (!Number.isFinite(classValue) || classValue <= 0) { missing.push("Численный класс бетона B по РД"); readiness.push("incomplete"); }
      else readiness.push(classValue >= 7.5 ? "ok" : "exceeded");
    }
  }
  const points = site?.points || [];
  for (const point of points) {
    const elevation = point.parameter === "geoHeight";
    const basis = parameterCriteria(elevation ? site?.elevationCriteria : criteria, point.parameter, point.project);
    const p = measurementNumber(point.project), a = measurementNumber(point.actual);
    const status = elevation ? compareMeasurement(p == null ? null : p * 1000, a == null ? null : a * 1000, point.parameter, basis)
      : (point.parameter.startsWith("side") ? compareMeasurement : comparePhysicalMeasurement)(p, a, point.parameter, basis);
    measurements.push({ label: `${point.label || "Точка без обозначения"}${elevation ? " (отметки переведены в мм)" : ""}`, key: point.parameter,
      project: p == null ? null : p * (elevation ? 1000 : 1), actual: a == null ? null : a * (elevation ? 1000 : 1), criteria: basis, status });
    if (!earth && fields.preparationApplication === "monolithic_nonrock" && point.parameter === "thickness") {
      if ((p != null && p < 100) || (a != null && a < 100)) {
        readiness.push("exceeded"); missing.push("Минимальная толщина 100 мм по СП 22, 4.25; это отдельное требование, не допуск отклонения");
      }
    }
    if (!point.label.trim()) { missing.push("Обозначение контрольной точки"); readiness.push("incomplete"); }
  }
  const required = earth ? ["depth", "geoHeight", "sideNorth", "sideSouth", "sideEast", "sideWest"] : ["thickness", "geoHeight", "sideNorth", "sideSouth", "sideEast", "sideWest"];
  for (const key of required) if (!points.some(p => p.parameter === key)) {
    missing.push(`Измерения: ${key}`); geometricRequirements.push("incomplete");
  }
  const elevationCount = points.filter(p => p.parameter === "geoHeight" && measurementNumber(p.project) != null && measurementNumber(p.actual) != null).length;
  const minimum = site?.elevationCriteria.rules?.geoHeight?.minimumCount || 2;
  if (elevationCount < minimum) { missing.push(`Отметки: нужно ${minimum}, заполнено ${elevationCount}`); geometricRequirements.push("incomplete"); }
  if (!earth && points.filter(p => p.parameter === "thickness").length < 2) { missing.push("Не менее двух точек толщины; полный объём по РД"); geometricRequirements.push("incomplete"); }
  if (measurements.some(m => m.status === "unverified")) missing.push("Подтверждённые критерии РД для параметров без применимой нормы");
  if (measurements.some(m => m.status === "incomplete")) missing.push("Проектные и фактические значения во всех точках");
  const geometry = summarizeMeasurements([...measurements.map(m => m.status), ...geometricRequirements]);
  const base = summarizeMeasurements(readiness);
  return { ...summarizeMeasurements([...measurements.map(m => m.status), ...geometricRequirements, ...readiness]), measurements, missing,
    geometry, readiness: base, summaryText: `Измерения: ${geometry.summaryText}; ${earth ? "готовность основания" : "документы подготовки"}: ${base.summaryText}${missing.length ? "; требуется: " + missing.join("; ") : ""}` };
}
