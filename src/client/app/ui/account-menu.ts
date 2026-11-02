/** Shared account menu: focus stays with the trigger on dismissal. */
export function initAccountMenu() {
  const trigger = document.getElementById("headerProfileButton");
  const menu = document.getElementById("accountMenu");
  if (!trigger || !menu) return;
  // The mobile rail is hidden; keep the same account control outside that layout.
  const account = trigger.parentElement;
  const sidebar = account?.closest("#workspaceSidebar");
  if (account && sidebar) {
    const mobile = matchMedia("(max-width: 768px)");
    const placeAccount = () => {
      if (mobile.matches) document.body.append(account);
      else sidebar.insertBefore(account, sidebar.querySelector(".sidebar-resize"));
    };
    mobile.addEventListener("change", placeAccount);
    placeAccount();
  }
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const close = (restore = false) => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restore) trigger.focus();
  };
  const open = (last = false) => {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    items[last ? items.length - 1 : 0]?.focus();
  };
  trigger.addEventListener("click", () => menu.hidden ? open() : close(true));
  trigger.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); open(event.key === "ArrowUp");
    }
  });
  menu.addEventListener("keydown", event => {
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault(); items[next].focus();
  });
  document.addEventListener("keydown", event => {
    if (!menu.hidden && event.key === "Escape") { event.preventDefault(); close(true); }
  });
  document.addEventListener("pointerdown", event => {
    if (event.target instanceof Node && !menu.contains(event.target) && !trigger.contains(event.target)) close();
  });
  menu.parentElement?.addEventListener("focusout", event => {
    if (event.relatedTarget instanceof Node && !menu.parentElement?.contains(event.relatedTarget)) close();
  });
  menu.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-account-theme]")) document.getElementById("themeToggleBtn")?.click();
    if (event.target.closest('[role="menuitem"]')) close(true);
  });
}
