import { t } from "../../shared/i18n/index.js";

const STORAGE_KEY = "workspace_sidebar_v1";
const COLLAPSED = 64;
const MIN = 208;
const MAX = 360;
const DEFAULT = 240;
const SNAP = 144;

/** Presentation preference only; keyboard behavior follows the WAI-ARIA Window Splitter pattern. */
export function initSidebar() {
  const sidebar = document.getElementById("workspaceSidebar");
  const toggle = document.getElementById("sidebarToggle");
  if (!sidebar || !toggle) return;
  const desktop = matchMedia("(min-width: 769px)");
  const handles = [...sidebar.querySelectorAll<HTMLElement>(".sidebar-resize")];
  const drawer = document.createElement("dialog");
  drawer.id = "mobileSidebarDrawer";
  drawer.className = "sidebar-drawer";
  drawer.setAttribute("aria-label", t("navigation"));
  document.body.append(drawer);
  const mobileToolbar = document.createElement("div");
  mobileToolbar.className = "mobile-sidebar-toolbar";
  const mobileToggle = document.createElement("button");
  mobileToggle.id = "mobileSidebarToggle";
  mobileToggle.className = "mobile-sidebar-toggle";
  mobileToggle.type = "button";
  mobileToggle.setAttribute("aria-controls", drawer.id);
  mobileToggle.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M2 7h20M2 17h12"/></svg>';
  mobileToolbar.append(mobileToggle);
  document.body.prepend(mobileToolbar);
  const edge = document.createElement("div");
  edge.className = "sidebar-swipe-edge";
  edge.setAttribute("aria-hidden", "true");
  document.body.append(edge);
  const scroll = sidebar.querySelector<HTMLElement>(".sidebar-scroll");
  const brand = sidebar.querySelector<HTMLElement>(".sidebar-brand");
  let mobileOpen = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let restoreMobileFocus = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let swipe: { x: number; y: number; open: boolean; progress: number; width: number; horizontal: boolean; paused: boolean; lastX: number; lastTime: number; velocity: number } | null = null;
  const paintMobile = (progress: number) => drawer.style.setProperty("--sidebar-progress", String(Math.max(0, Math.min(1, progress))));
  const visibleProgress = () => {
    if (!drawer.open) return 0;
    if (reducedMotion.matches) return Number(getComputedStyle(sidebar).opacity);
    const rect = sidebar.getBoundingClientRect();
    return Math.max(0, Math.min(1, 1 + rect.left / rect.width));
  };
  const tooltip = document.createElement("div");
  tooltip.className = "sidebar-tooltip";
  tooltip.id = "sidebarTooltip";
  tooltip.role = "tooltip";
  tooltip.hidden = true;
  document.body.append(tooltip);
  let width = DEFAULT;
  let collapsed = false;
  let tooltipSource: HTMLElement | null = null;
  let tooltipTimer: ReturnType<typeof setTimeout> | undefined;
  let drag: { handle: HTMLElement; pointerId: number; x: number; width: number; savedWidth: number; collapsed: boolean } | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Number.isFinite(saved.width)) width = Math.max(MIN, Math.min(MAX, saved.width));
    collapsed = saved?.collapsed === true;
  } catch { /* Preferences are optional, including in private browsing. */ }

  const hideTooltip = () => {
    clearTimeout(tooltipTimer);
    tooltip.hidden = true;
    tooltipSource?.removeAttribute("aria-describedby");
    tooltipSource = null;
  };
  const render = () => {
    const current = collapsed ? COLLAPSED : width;
    document.body.style.setProperty("--sidebar-width", `${current}px`);
    sidebar.dataset.collapsed = String(desktop.matches && collapsed);
    sidebar.dataset.mobileOpen = String(!desktop.matches && drawer.open);
    const host = desktop.matches ? document.body : drawer;
    if (sidebar.parentElement !== host) host.append(sidebar);
    if (scroll) scroll.inert = !desktop.matches && !mobileOpen;
    if (brand) brand.tabIndex = desktop.matches ? (collapsed ? -1 : 0) : (mobileOpen ? 0 : -1);
    if (desktop.matches && drawer.open) drawer.close();
    document.body.classList.toggle("sidebar-is-open", !desktop.matches && drawer.open);
    drawer.setAttribute("aria-label", t("navigation"));
    mobileToggle.setAttribute("aria-label", t("expandSidebar"));
    mobileToggle.setAttribute("aria-expanded", String(!desktop.matches && mobileOpen));
    const expanded = desktop.matches ? !collapsed : mobileOpen;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", t(expanded ? "collapseSidebar" : "expandSidebar"));
    for (const handle of handles) {
      handle.tabIndex = desktop.matches ? 0 : -1;
      handle.setAttribute("aria-valuenow", String(current));
      handle.setAttribute("aria-valuetext", collapsed ? t("sidebarCollapsed") : t("sidebarWidth", { width }));
    }
  };
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ width, collapsed })); } catch { /* Optional. */ }
  };
  const finishMobileClose = () => {
    if (mobileOpen || swipe?.horizontal) return;
    clearTimeout(closeTimer);
    closeTimer = undefined;
    drawer.close();
    render();
    if (restoreMobileFocus && !desktop.matches) mobileToggle.focus();
    restoreMobileFocus = false;
  };
  const settleMobile = (open: boolean, restore = false) => {
    if (desktop.matches) return;
    const progress = visibleProgress();
    clearTimeout(closeTimer);
    closeTimer = undefined;
    swipe = null;
    drawer.dataset.dragging = "true";
    paintMobile(progress);
    if (open && !drawer.open) drawer.showModal();
    mobileOpen = open;
    restoreMobileFocus = restore;
    render();
    // Flush the current position before resuming an interruptible CSS transition.
    void sidebar.getBoundingClientRect();
    delete drawer.dataset.dragging;
    drawer.dataset.state = open ? "open" : "closing";
    paintMobile(open ? 1 : 0);
    if (!open && drawer.open) closeTimer = setTimeout(finishMobileClose, reducedMotion.matches ? 140 : 280);
    if (open) toggle.focus();
  };
  const closeMobile = (restore = false) => {
    if (desktop.matches || !drawer.open) return;
    if (!mobileOpen && closeTimer) { restoreMobileFocus ||= restore; return; }
    settleMobile(false, restore);
  };
  sidebar.addEventListener("transitionend", event => {
    if (event.target === sidebar && ["transform", "opacity"].includes(event.propertyName)) finishMobileClose();
  });
  drawer.addEventListener("click", event => { if (event.target === drawer && !swipe?.horizontal) closeMobile(true); });
  drawer.addEventListener("cancel", event => { event.preventDefault(); closeMobile(true); });
  drawer.addEventListener("close", () => {
    if (drawer.open) return;
    clearTimeout(closeTimer); closeTimer = undefined; mobileOpen = false;
    paintMobile(0); render();
  });
  mobileToggle.addEventListener("click", () => settleMobile(true));
  sidebar.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest(".tab, [data-workspace-home]")) closeMobile();
  });
  const toggleSidebar = () => {
    if (!desktop.matches) { settleMobile(!mobileOpen, mobileOpen); return; }
    collapsed = !collapsed;
    hideTooltip();
    render();
    save();
  };
  const resize = (next: number) => {
    collapsed = next < SNAP;
    if (collapsed && drag) width = drag.savedWidth;
    else if (!collapsed) width = Math.round(Math.max(MIN, Math.min(MAX, next)));
    hideTooltip();
    render();
  };
  const finishDrag = (cancel = false) => {
    if (!drag) return;
    const previous = drag;
    drag = null;
    if (cancel) { width = previous.savedWidth; collapsed = previous.collapsed; }
    if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    document.body.classList.remove("is-sidebar-resizing");
    render();
    if (!cancel) save();
  };
  for (const handle of handles) {
    handle.addEventListener("pointerdown", event => {
      if (!desktop.matches || event.button !== 0 || drag) return;
      event.preventDefault();
      handle.focus();
      drag = { handle, pointerId: event.pointerId, x: event.clientX, width: collapsed ? COLLAPSED : width, savedWidth: width, collapsed };
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("is-sidebar-resizing");
      hideTooltip();
    });
    handle.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      resize(drag.width + event.clientX - drag.x);
    });
    handle.addEventListener("pointerup", () => finishDrag());
    handle.addEventListener("pointercancel", () => finishDrag(true));
    handle.addEventListener("lostpointercapture", () => finishDrag());
    handle.addEventListener("dblclick", toggleSidebar);
    handle.addEventListener("keydown", event => {
      const current = collapsed ? COLLAPSED : width;
      if (event.key === "Enter") toggleSidebar();
      else if (event.key === "Home") { collapsed = true; render(); save(); }
      else if (event.key === "End") { resize(MAX); save(); }
      else if (event.key === "ArrowLeft") { resize(current <= MIN ? COLLAPSED : current - 16); save(); }
      else if (event.key === "ArrowRight") { resize(collapsed ? MIN : current + 16); save(); }
      else return;
      event.preventDefault();
    });
  }
  toggle.addEventListener("click", toggleSidebar);
  const cancelSwipe = () => {
    const gesture = swipe; swipe = null;
    if (gesture && (gesture.horizontal || gesture.paused)) settleMobile(gesture.open);
  };
  // Wait for horizontal intent, then track the finger in pixels without easing.
  document.addEventListener("touchstart", event => {
    cancelSwipe();
    if (desktop.matches || event.touches.length !== 1 || document.querySelector("dialog:modal:not(.sidebar-drawer)")) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true], .mobile-sidebar-toggle")) return;
    const point = event.touches[0];
    if (!point || (!drawer.open && point.clientX > 28)) return;
    const progress = visibleProgress();
    const paused = drawer.open && (progress > 0 && progress < 1 || closeTimer !== undefined);
    if (paused) {
      clearTimeout(closeTimer); closeTimer = undefined;
      drawer.dataset.dragging = "true"; paintMobile(progress);
    }
    swipe = { x: point.clientX, y: point.clientY, open: mobileOpen, progress, width: sidebar.getBoundingClientRect().width || Math.min(280, innerWidth - 48), horizontal: false, paused, lastX: point.clientX, lastTime: performance.now(), velocity: 0 };
  }, { passive: true });
  document.addEventListener("touchmove", event => {
    if (!swipe) return;
    if (event.touches.length !== 1) { cancelSwipe(); return; }
    const point = event.touches[0];
    if (!point) return;
    const dx = point.clientX - swipe.x, dy = point.clientY - swipe.y;
    if (!swipe.horizontal && Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { cancelSwipe(); return; }
    if (!swipe.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5 && (drawer.open || dx > 0)) {
      clearTimeout(closeTimer); closeTimer = undefined;
      drawer.dataset.dragging = "true";
      paintMobile(swipe.progress);
      if (!drawer.open) drawer.showModal();
      render();
      swipe.horizontal = true;
      drawer.dataset.state = "dragging";
    }
    if (!swipe.horizontal) return;
    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    swipe.velocity = (point.clientX - swipe.lastX) / Math.max(1, now - swipe.lastTime);
    swipe.lastX = point.clientX; swipe.lastTime = now;
    paintMobile(swipe.progress + dx / swipe.width);
  }, { passive: false });
  document.addEventListener("touchend", event => {
    const gesture = swipe; swipe = null;
    const point = event.changedTouches[0];
    if (!gesture || !point || desktop.matches) return;
    if (!gesture.horizontal) { if (gesture.paused) settleMobile(gesture.open); return; }
    const dx = point.clientX - gesture.x;
    const velocity = performance.now() - gesture.lastTime < 100 ? gesture.velocity : 0;
    const open = Math.abs(dx) >= 36 && Math.abs(velocity) > .5 ? velocity > 0 : gesture.progress + dx / gesture.width >= .5;
    settleMobile(open);
  }, { passive: true });
  document.addEventListener("touchcancel", cancelSwipe, { passive: true });
  sidebar.querySelectorAll<HTMLElement>(".tab, .sidebar-link, #sidebarToggle").forEach(control => {
    const showTooltip = () => {
      hideTooltip();
      if (!collapsed || !desktop.matches || drag) return;
      tooltipSource = control;
      tooltip.textContent = control.getAttribute("aria-label") || control.querySelector("[data-i18n]")?.textContent || control.textContent;
      tooltip.hidden = false;
      const rect = control.getBoundingClientRect();
      tooltip.style.left = `${sidebar.getBoundingClientRect().right + 10}px`;
      tooltip.style.top = `${Math.max(8, Math.min(innerHeight - tooltip.offsetHeight - 8, rect.top + (rect.height - tooltip.offsetHeight) / 2))}px`;
      control.setAttribute("aria-describedby", tooltip.id);
    };
    const scheduleHide = () => { tooltipTimer = setTimeout(hideTooltip, 120); };
    control.addEventListener("pointerenter", showTooltip);
    control.addEventListener("focus", showTooltip);
    control.addEventListener("pointerleave", scheduleHide);
    control.addEventListener("blur", hideTooltip);
    control.addEventListener("click", hideTooltip);
  });
  tooltip.addEventListener("pointerenter", () => clearTimeout(tooltipTimer));
  tooltip.addEventListener("pointerleave", hideTooltip);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      hideTooltip();
      if (!desktop.matches && drawer.open && document.getElementById("accountMenu")?.hidden !== false) {
        event.preventDefault(); closeMobile(true);
      }
      finishDrag(true);
    }
  });
  sidebar.querySelector(".sidebar-scroll")?.addEventListener("scroll", hideTooltip);
  window.addEventListener("resize", () => { hideTooltip(); cancelSwipe(); });
  window.addEventListener("blur", () => finishDrag(true));
  desktop.addEventListener("change", () => {
    const focused = sidebar.contains(document.activeElement) || document.activeElement === mobileToggle;
    clearTimeout(closeTimer); closeTimer = undefined; swipe = null; mobileOpen = false;
    delete drawer.dataset.dragging; paintMobile(0);
    if (drawer.open) drawer.close();
    finishDrag(true); hideTooltip(); render();
    if (focused) (desktop.matches ? toggle : mobileToggle).focus();
  });
  document.addEventListener("app:language-changed", () => { hideTooltip(); render(); });
  document.addEventListener("app:tab-activated", () => { hideTooltip(); closeMobile(); });
  render();
}
