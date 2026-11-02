import { initializeLocalization } from "../../shared/i18n/index.js";
import { initSidebar } from "./sidebar.js";
import { initAccountMenu } from "./account-menu.js";
import { showAlert } from "../../utils.js";
import { logoutUser } from "../../auth.js";

/** Account pages use the same built sidebar, with links into workspace sections. */
export async function initProfileNavigation() {
  const sidebar = document.getElementById("workspaceSidebar");
  if (!sidebar) return;
  for (const button of sidebar.querySelectorAll<HTMLButtonElement>(".tab[data-target]")) {
    const link = document.createElement("a");
    for (const { name, value } of [...button.attributes]) if (name !== "type") link.setAttribute(name, value);
    link.classList.remove("active");
    link.href = "index.html#" + button.dataset.target;
    link.append(...button.childNodes);
    button.replaceWith(link);
  }
  const settings = location.pathname.endsWith("edit-profile.html");
  sidebar.querySelector(settings ? 'a[href="edit-profile.html"]' : 'a[href="profile.html"]')?.setAttribute("aria-current", "page");
  await initializeLocalization();
  initSidebar();
  initAccountMenu();
  // profile.html retains its existing logout/error handling; settings has no handler.
  if (settings) document.getElementById("btnLogout")?.addEventListener("click", async () => {
    try {
      await logoutUser();
      location.href = "login.html";
    } catch {
      await showAlert("Не удалось выйти. Попробуйте ещё раз.", "Ошибка");
    }
  });
}
