import { getProjectCollectionSnapshot, setProjectCollectionDoc } from "../../../app/repositories/firestore-repository.js";
import type { AxisIntersection } from "./axis-evaluation.js";

const collection = "axisIntersections";

export async function loadAxisCatalog(projectId: string) {
  const snapshot = await getProjectCollectionSnapshot(projectId, collection);
  return snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as AxisIntersection)
    .sort((a, b) => a.label.localeCompare(b.label, "ru", { numeric: true }));
}

export async function saveAxisIntersection(projectId: string, point: AxisIntersection) {
  const { id, ...data } = point;
  await setProjectCollectionDoc(projectId, collection, id, data);
}
