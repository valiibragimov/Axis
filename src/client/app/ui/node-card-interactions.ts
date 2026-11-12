import { escapeHtml } from "../../shared/html.js";

interface NodeCardInteractionOptions {
  onOpen?: () => unknown;
  onDelete?: (button: HTMLElement) => Promise<void> | void;
}

const safeValue = (value: unknown) => escapeHtml(value == null ? "" : String(value));

function isDeleteActionTarget(target: EventTarget | null) {
  if (!target || typeof (target as Element).closest !== "function") {
    return false;
  }
  return !!(target as Element).closest('[data-act="del"]');
}

export function buildNodeDeleteIconButton(titleText = "Удалить проверку") {
  const safeTitle = safeValue(titleText);
  return `
    <button type="button" class="node-delete-icon" data-act="del" title="${safeTitle}" aria-label="${safeTitle}">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  `;
}

export function setupNodeCardInteractions(
  row: Element | null,
  { onOpen, onDelete }: NodeCardInteractionOptions = {}
) {
  if (!row || typeof row.addEventListener !== "function") return;

  const interactiveRow = row as HTMLElement;
  interactiveRow.classList.add("node-card-compact");
  interactiveRow.removeAttribute("role");
  interactiveRow.removeAttribute("tabindex");

  if (typeof onOpen === "function") {
    const title = interactiveRow.querySelector(".node-title");
    const openButton = row.ownerDocument.createElement("button");
    openButton.type = "button";
    openButton.className = "node-open-button";
    if (title) {
      openButton.textContent = title.textContent?.trim() || "—";
      (interactiveRow.querySelector(".node-header-controls") || interactiveRow).append(openButton);
    }
    else {
      openButton.textContent = interactiveRow.getAttribute("aria-label") || interactiveRow.textContent?.trim() || "—";
      interactiveRow.prepend(openButton);
    }
    interactiveRow.addEventListener("click", async (event) => {
      if (isDeleteActionTarget(event.target)) return;
      await onOpen();
    });
  }

  const deleteBtn = interactiveRow.querySelector<HTMLElement>('[data-act="del"]');
  if (deleteBtn && typeof onDelete === "function") {
    deleteBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await onDelete(deleteBtn);
    });
  }
}
