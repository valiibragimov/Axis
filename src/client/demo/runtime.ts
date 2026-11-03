import { resetDemoRepository } from "./repositories/app-repository.js";
import { DEMO_PROJECT_ID } from "./runtime-context.js";

const UNAVAILABLE_MESSAGE = "Функция недоступна в демонстрационном режиме";
const DEMO_TRANSIENT_STORAGE_KEYS = [
  "active_tab_v1",
  "currentProjectId",
  "current_project_id",
  "selected_construction"
];

function notifyUnavailable() {
  const toast = document.createElement("div");
  toast.className = "notification warning show";
  toast.setAttribute("role", "status");
  toast.textContent = UNAVAILABLE_MESSAGE;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

function bindUnavailableAction(element: Element | null) {
  if (!(element instanceof HTMLElement)) return;
  element.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    notifyUnavailable();
  }, { capture: true });
}

export function prepareDemoRuntime() {
  document.documentElement.dataset.runtimeMode = "demo";
  document.body.dataset.runtimeMode = "demo";
  localStorage.setItem("current_project_id", DEMO_PROJECT_ID);
  localStorage.setItem("selected_construction", "foundation_slab");
}

function resetDemoClientState() {
  resetDemoRepository();
  for (const key of DEMO_TRANSIENT_STORAGE_KEYS) localStorage.removeItem(key);
  localStorage.setItem("current_project_id", DEMO_PROJECT_ID);
  localStorage.setItem("selected_construction", "foundation_slab");
}

export function mountDemoRuntimeControls() {
  const main = document.querySelector("main");
  if (main && !document.getElementById("demoModeBanner")) {
    main.insertAdjacentHTML("afterbegin", `
      <div id="demoModeBanner" class="demo-notice" role="status">
        <div><strong>Демонстрационный режим</strong> — используются только синтетические данные. Изменения сохраняются локально в этом браузере.</div>
        <button id="btnResetDemo" type="button" class="btn-small btn-primary lg-btn lg-btn--pill">Сбросить демо</button>
      </div>
    `);
  }

  document.getElementById("btnResetDemo")?.addEventListener("click", () => {
    resetDemoClientState();
    window.location.reload();
  });

  [

    "btnLogout",
    "btnSummaryGenerate",
    "btnSummaryExportPdf"
  ].forEach((id) => bindUnavailableAction(document.getElementById(id)));

  document
    .querySelectorAll<HTMLElement>("[data-bim-visual-open], .bim-viewer-launcher__button")
    .forEach(bindUnavailableAction);
}
