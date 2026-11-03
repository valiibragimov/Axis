import type { WorkspaceContext } from "./workspace-context.js";
import { APP_STORAGE_KEYS } from "./storage.js";
import { dispatchAppTabActivated } from "./services/module-activation.js";
import type { JournalGeodesyApi } from "./modules/journal.js";
import type {
  StrengthService,
  StrengthState
} from "../features/inspections/strength/index.js";
import { setCurrentStrengthCheckId } from "../features/inspections/strength/index.js";
import type {
  ReinforcementService,
  ReinforcementState
} from "../features/inspections/reinforcement/index.js";

type JournalModule = typeof import("./modules/journal.js");
type GeometryModule = typeof import("./modules/geometry.js");
type ReinforcementModule = typeof import("./modules/reinforcement.js");
type StrengthModule = typeof import("./modules/strength.js");
type SummaryModule = typeof import("./modules/summary.js");
type ControlPlanModule = typeof import("../features/control-plan/index.js");
type OverviewModule = typeof import("./modules/overview.js");

const INSPECTION_TARGETS = new Set(["geo", "reinforcement", "geometry", "strength"]);

export interface StrengthRuntimeDependencies {
  state: StrengthState;
  service: StrengthService;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  getCurrentProjectId(): string | null;
  showNotification(message: string, tone?: string): void;
  setConstruction(
    construction: string,
    subtype?: string,
    pileElement?: string
  ): unknown;
}

export interface ReinforcementRuntimeDependencies {
  state: ReinforcementState;
  service: ReinforcementService;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  getCurrentProjectId(): string | null;
  showNotification(message: string, tone?: string): void;
  confirm(message: string): Promise<boolean>;
  setConstruction(
    construction: string,
    subtype?: string,
    pileElement?: string
  ): unknown;
}

interface ModuleRuntimeOptions {
  workspace: WorkspaceContext;
  onJournalTabActivated?: () => void;
  journalGeodesy: JournalGeodesyApi;
  reinforcement: ReinforcementRuntimeDependencies;
  strength: StrengthRuntimeDependencies;
}

type ModuleAction<TModule, TResult> = (module: TModule) => TResult | Promise<TResult>;

export function createModuleRuntime({
  workspace,
  onJournalTabActivated,
  journalGeodesy,
  reinforcement,
  strength
}: ModuleRuntimeOptions) {
  let journalModulePromise: Promise<JournalModule> | null = null;
  let geometryModulePromise: Promise<GeometryModule> | null = null;
  let reinforcementModulePromise: Promise<ReinforcementModule> | null = null;
  let strengthModulePromise: Promise<StrengthModule> | null = null;
  let summaryModulePromise: Promise<SummaryModule> | null = null;
  let controlPlanModulePromise: Promise<ControlPlanModule> | null = null;
  let overviewModulePromise: Promise<OverviewModule> | null = null;
  const tabModulePromises = new Map<string, Promise<void>>();

  const withModule = <TModule, TResult>(
    getModule: () => Promise<TModule>,
    scope: string,
    action: ModuleAction<TModule, TResult>,
    fallback?: TResult
  ) =>
    getModule()
      .then(action)
      .catch((error) => {
        console.error(`[${scope}] Не удалось загрузить модуль`, error);
        return fallback;
      });

  const getJournalModule = () => {
    if (!journalModulePromise) {
      journalModulePromise = import("./modules/journal.js")
        .then((module) => {
          module.configureJournalWorkspace(workspace, () => withModule(getSummaryModule, "Summary", module => module.updateSummaryTab()), {
            save: () => withModule(getGeometryModule, "Geometry", module => module.saveGeomChecks()),
            render: () => withModule(getGeometryModule, "Geometry", module => module.renderGeomChecks()),
            load: id => withModule(getGeometryModule, "Geometry", module => module.loadGeomCheck(id))
          });
          module.configureJournalGeodesy(journalGeodesy);
          module.configureJournalReinforcement({
            checks: reinforcement.state.checks,
            clearChecks: async (projectId) => {
              await reinforcement.service.clearChecks(projectId);
            },
            deleteCheck: (projectId, checkId) =>
              reinforcement.service.deleteCheck(projectId, checkId),
            saveChecks: () =>
              withModule(
                getReinforcementModule,
                "Reinforcement",
                (reinforcementModule) =>
                  reinforcementModule.saveReinfChecks()
              ),
            renderChecks: () =>
              withModule(
                getReinforcementModule,
                "Reinforcement",
                (reinforcementModule) =>
                  reinforcementModule.renderReinfChecks()
              ),
            loadCheck: (checkId) =>
              withModule(
                getReinforcementModule,
                "Reinforcement",
                (reinforcementModule) =>
                  reinforcementModule.loadReinfCheck(checkId)
              ),
            getCurrentCheckId: () =>
              reinforcement.state.currentCheckId,
            setCurrentCheckId: (checkId) => {
              reinforcement.state.currentCheckId = checkId;
            },
            resetInspectionStatus: () => {
              reinforcement.inspectionState.reinforcement = false;
              reinforcement.inspectionChecked.reinforcement = false;
            }
          });
          module.configureJournalStrength({
            checks: strength.state.checks,
            clearChecks: async (projectId) => {
              await strength.service.clearChecks(projectId);
            },
            deleteCheck: (projectId, checkId) =>
              strength.service.deleteCheck(projectId, checkId),
            saveChecks: () =>
              withModule(
                getStrengthModule,
                "Strength",
                (strengthModule) => strengthModule.saveStrengthChecks()
              ),
            renderChecks: () =>
              withModule(
                getStrengthModule,
                "Strength",
                (strengthModule) => strengthModule.renderStrengthChecks()
              ),
            loadCheck: (checkId) =>
              withModule(
                getStrengthModule,
                "Strength",
                (strengthModule) => strengthModule.loadStrengthCheck(checkId)
              ),
            setCurrentCheckId: (checkId) =>
              setCurrentStrengthCheckId(strength.state, checkId),
            resetInspectionStatus: () => {
              strength.inspectionState.strength = false;
              strength.inspectionChecked.strength = false;
            }
          });
          module.initJournalModule();
          return module;
        })
        .catch((error) => {
          journalModulePromise = null;
          throw error;
        });
    }
    return journalModulePromise;
  };

  const getGeometryModule = () => {
    if (!geometryModulePromise) {
      geometryModulePromise = import("./modules/geometry.js")
        .then((module) => {
          module.configureGeometryWorkspace(workspace, {
            updateSummary: () => withModule(getSummaryModule, "Summary", module => module.updateSummaryTab()),
            addJournalEntry: params => withModule(getJournalModule, "Journal", module => module.addJournalEntry(params as any)),
            upsertJournalEntry: params => withModule(getJournalModule, "Journal", module => module.upsertJournalEntry(params as any)),
            notifySync: ref => withModule(getJournalModule, "Journal", module => module.notifyFirestoreSyncStatus(ref as any))
          });
          module.initGeometryModule();
          return module;
        })
        .catch((error) => {
          geometryModulePromise = null;
          throw error;
        });
    }
    return geometryModulePromise;
  };

  const getReinforcementModule = () => {
    if (!reinforcementModulePromise) {
      reinforcementModulePromise = import("./modules/reinforcement.js")
        .then((module) => {
          module.configureReinforcementModule({
            ...reinforcement,
            updateSummary: () =>
              withModule(
                getSummaryModule,
                "Summary",
                (summaryModule) => summaryModule.updateSummaryTab()
              ),
            addJournalEntry: (params) =>
              withModule(
                getJournalModule,
                "Journal",
                (journalModule) => journalModule.addJournalEntry(params as any)
              ),
            upsertJournalEntry: (params) =>
              withModule(
                getJournalModule,
                "Journal",
                (journalModule) =>
                  journalModule.upsertJournalEntry(params as any)
              ),
            notifyFirestoreSyncStatus: (docRef) =>
              withModule(
                getJournalModule,
                "Journal",
                (journalModule) =>
                  journalModule.notifyFirestoreSyncStatus(docRef as any)
              )
          });
          module.initReinforcementModule();
          return module;
        })
        .catch((error) => {
          reinforcementModulePromise = null;
          throw error;
        });
    }
    return reinforcementModulePromise;
  };

  const getStrengthModule = () => {
    if (!strengthModulePromise) {
      strengthModulePromise = import("./modules/strength.js")
        .then((module) => {
          module.configureStrengthModule({
            ...strength,
            updateSummary: () =>
              withModule(
                getSummaryModule,
                "Summary",
                (summaryModule) => summaryModule.updateSummaryTab()
              ),
            addJournalEntry: (params) =>
              withModule(
                getJournalModule,
                "Journal",
                (journalModule) => journalModule.addJournalEntry(params as any)
              ),
            upsertJournalEntry: (params) =>
              withModule(
                getJournalModule,
                "Journal",
                (journalModule) => journalModule.upsertJournalEntry(params as any)
              ),
            notifyFirestoreSyncStatus: (docRef) =>
              withModule(
                getJournalModule,
                "Journal",
                (journalModule) =>
                  journalModule.notifyFirestoreSyncStatus(docRef as any)
              )
          });
          module.initStrengthModule();
          return module;
        })
        .catch((error) => {
          strengthModulePromise = null;
          throw error;
        });
    }
    return strengthModulePromise;
  };

  const getSummaryModule = () => {
    if (!summaryModulePromise) {
      summaryModulePromise = import("./modules/summary.js")
        .then((module) => {
          module.configureSummaryWorkspace(workspace, (moduleKey = null, construction = null) => withModule(getJournalModule, "Journal", module => module.setJournalFilters(moduleKey, construction)));
          module.configureSummaryStrength(() => strength.state.checks);
          module.configureSummaryReinforcement(
            () => reinforcement.state.checks
          );
          module.initSummaryModule();
          return module;
        })
        .catch((error) => {
          summaryModulePromise = null;
          throw error;
        });
    }
    return summaryModulePromise;
  };

  const getControlPlanModule = () => {
    if (!controlPlanModulePromise) {
      controlPlanModulePromise = import("../features/control-plan/index.js")
        .then((module) => {
          module.configureControlPlanWorkspace(workspace);
          module.initControlPlanModule();
          return module;
        })
        .catch((error) => {
          controlPlanModulePromise = null;
          throw error;
        });
    }
    return controlPlanModulePromise;
  };

  const getOverviewModule = () => {
    if (!overviewModulePromise) {
      overviewModulePromise = import("./modules/overview.js")
        .then((module) => {
          module.configureOverviewWorkspace(workspace);
          module.configureOverviewStrength(() => strength.state.checks.size);
          module.configureOverviewReinforcement(
            () => reinforcement.state.checks.size
          );
          module.initOverviewModule();
          return module;
        })
        .catch((error) => {
          overviewModulePromise = null;
          throw error;
        });
    }
    return overviewModulePromise;
  };

  const loadKnowledgeModule = async () => {
    const module = await import("./modules/knowledge.js");
    module.initKnowledgeModule();
  };

  const tabModuleLoaders = new Map<string, () => Promise<void>>([
    ["overview", async () => void (await getOverviewModule())],
    ["journal", async () => void (await getJournalModule())],
    ["controlPlan", async () => void (await getControlPlanModule())],
    ["summary", async () => void (await getSummaryModule())],
    ["geometry", async () => void (await getGeometryModule())],
    ["reinforcement", async () => void (await getReinforcementModule())],
    ["strength", async () => void (await getStrengthModule())],
    ["documents", async () => {
      const module = await import("../features/documents/runtime.js");
      module.initDocuments(workspace);
    }],
    ["knowledge", loadKnowledgeModule]
  ]);

  const closeNavigationGroups = () => {
    document.querySelectorAll<HTMLElement>(".tabs-group.is-open").forEach((group) => {
      group.classList.remove("is-open");
      group.querySelector<HTMLElement>(".tabs-group-trigger")?.setAttribute("aria-expanded", "false");
    });

  };

  const syncDesktopTabState = (target: string | null | undefined) => {
    document.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.target === target);
      tab.setAttribute("aria-current", tab.dataset.target === target ? "page" : "false");
    });
    document.querySelectorAll<HTMLElement>(".tabs-group").forEach((group) => {
      const isActive = group.dataset.tabsGroup === "inspections" && INSPECTION_TARGETS.has(String(target || ""));
      group.classList.toggle("is-active", isActive);
      group.querySelector<HTMLElement>(".tabs-group-trigger")?.setAttribute(
        "aria-current",
        isActive ? "page" : "false"
      );
    });
  };

  const ensureTabModule = (target: string | null | undefined) => {
    if (!target) return;
    const loader = tabModuleLoaders.get(target);
    if (!loader || tabModulePromises.has(target)) return;

    const promise = Promise.resolve()
      .then(loader)
      .catch((error) => {
        tabModulePromises.delete(target);
        console.error(`[Tabs] Не удалось загрузить модуль "${target}"`, error);
      });

    tabModulePromises.set(target, promise);
  };

  const activateTarget = (target: string | null | undefined, storageKey: string) => {
    if (!target) return;

    document.body.dataset.workspaceTab = target;
    syncDesktopTabState(target);
    document.querySelectorAll<HTMLElement>(".section").forEach((section) => {
      section.classList.toggle("active", section.id === target);
    });

    closeNavigationGroups();

    localStorage.setItem(storageKey, target);
    ensureTabModule(target);
    dispatchAppTabActivated(target);

    if (target === "journal") {
      onJournalTabActivated?.();
    }
  };

  const initTabsNavigation = (storageKey: string) => {
    document.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
      if (tab.dataset.navigationBound === "true") return;
      tab.dataset.navigationBound = "true";
      tab.addEventListener("click", () => {
        activateTarget(tab.dataset.target, storageKey);
      });
    });

    document.querySelectorAll<HTMLElement>(".tabs-group-trigger").forEach((trigger) => {
      if (trigger.dataset.navigationBound === "true") return;
      trigger.dataset.navigationBound = "true";
      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const group = trigger.closest<HTMLElement>(".tabs-group");
        if (!group) return;
        const shouldOpen = !group.classList.contains("is-open");
        closeNavigationGroups();
        group.classList.toggle("is-open", shouldOpen);
        trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      });
    });

    if (document.body.dataset.navigationGroupsBound !== "true") {
      document.body.dataset.navigationGroupsBound = "true";
      document.addEventListener("click", (event) => {
        if ((event.target as Element | null)?.closest?.(".tabs-group")) return;
        closeNavigationGroups();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeNavigationGroups();
      });
    }

    const savedTarget = localStorage.getItem(storageKey);
    const sectionTargets = new Set(
      Array.from(document.querySelectorAll<HTMLElement>(".section")).map((section) => section.id)
    );
    const requestedTarget = location.hash.slice(1);
    const initialTarget = sectionTargets.has(requestedTarget) ? requestedTarget : savedTarget && sectionTargets.has(savedTarget)
      ? savedTarget
      : document.querySelector<HTMLElement>(".tab.active[data-target]")?.dataset.target || "overview";
    activateTarget(initialTarget, storageKey);
    if (sectionTargets.has(requestedTarget)) history.replaceState(history.state, "", location.pathname + location.search);
  };

  let navigationInitialized = false;
  const initNavigation = (storageKey = APP_STORAGE_KEYS.tab) => {
    if (navigationInitialized) {
      // A failed lazy import clears its tab promise; allow retry without
      // rebinding handlers, replacing controls or firing another activation.
      ensureTabModule(document.body.dataset.workspaceTab);
      return;
    }
    navigationInitialized = true;
    try {
      initTabsNavigation(storageKey);

    } catch (error) {
      navigationInitialized = false;
      throw error;
    }
  };

  return {
    initNavigation,
    ensureTabModule,
    initTabsNavigation,

    loadJournal: () => withModule(getJournalModule, "Journal", (module) => module.loadJournal()),
    saveJournal: () => withModule(getJournalModule, "Journal", (module) => module.saveJournal()),
    renderJournal: () => withModule(getJournalModule, "Journal", (module) => module.renderJournal()),
    loadJournalSessionsForProject: (projectId: string) =>
      withModule(getJournalModule, "Journal", (module) => module.loadJournalSessionsForProject(projectId)),
    loadJournalFromFirestore: () =>
      withModule(getJournalModule, "Journal", (module) => module.loadJournalFromFirestore()),
    applyJournalFilter: () =>
      withModule(getJournalModule, "Journal", (module) => module.applyJournalFilter()),
    setJournalFilters: (moduleKey: string | null = null, constructionValue: string | null = null) =>
      withModule(
        getJournalModule,
        "Journal",
        (module) => module.setJournalFilters(moduleKey, constructionValue)
      ),
    addJournalEntry: (params: unknown) =>
      withModule(getJournalModule, "Journal", (module) => module.addJournalEntry(params as any), null),
    upsertJournalEntry: (params: unknown) =>
      withModule(
        getJournalModule,
        "Journal",
        (module) => module.upsertJournalEntry(params as any),
        null
      ),
    notifyFirestoreSyncStatus: (docRef: unknown) =>
      withModule(getJournalModule, "Journal", (module) => {
        if (typeof module.notifyFirestoreSyncStatus === "function") {
          return module.notifyFirestoreSyncStatus(docRef as any);
        }
        return undefined;
      }),
    withGeometryModule: <TResult = unknown>(
      action: ModuleAction<GeometryModule, TResult>,
      fallback?: TResult
    ) => withModule(getGeometryModule, "Geometry", action, fallback),
    getGeometryModule,
    loadGeomChecks: () => withModule(getGeometryModule, "Geometry", (module) => module.loadGeomChecks()),
    saveGeomChecks: () => withModule(getGeometryModule, "Geometry", (module) => module.saveGeomChecks()),
    renderGeomChecks: () =>
      withModule(getGeometryModule, "Geometry", (module) => module.renderGeomChecks()),
    loadGeomCheck: (id: string) =>
      withModule(getGeometryModule, "Geometry", (module) => module.loadGeomCheck(id)),
    updateGeomFieldsVisibility: () =>
      withModule(getGeometryModule, "Geometry", (module) => module.updateGeomFieldsVisibility()),
    refreshGeometryBimElementsIfLoaded: () => {
      if (!geometryModulePromise) return Promise.resolve();
      return withModule(getGeometryModule, "Geometry", (module) => module.loadGeomBimElements?.());
    },
    withReinforcementModule: <TResult = unknown>(
      action: ModuleAction<ReinforcementModule, TResult>,
      fallback?: TResult
    ) => withModule(getReinforcementModule, "Reinforcement", action, fallback),
    getReinforcementModule,
    refreshReinforcementBimElementsIfLoaded: () => {
      if (!reinforcementModulePromise) return Promise.resolve();
      return withModule(
        getReinforcementModule,
        "Reinforcement",
        (module) => module.loadReinfBimElements?.()
      );
    },
    withStrengthModule: <TResult = unknown>(
      action: ModuleAction<StrengthModule, TResult>,
      fallback?: TResult
    ) => withModule(getStrengthModule, "Strength", action, fallback),
    getStrengthModule,
    refreshStrengthBimElementsIfLoaded: () => {
      if (!strengthModulePromise) return Promise.resolve();
      return withModule(getStrengthModule, "Strength", (module) => module.loadStrengthBimElements?.());
    },
    getSummaryModule,
    updateSummaryTab: async () => {
      try {
        const module = await getSummaryModule();
        return await module.updateSummaryTab();
      } catch (error) {
        console.error("[Summary] Не удалось загрузить модуль Итога", error);
      }
    }
  };
}
