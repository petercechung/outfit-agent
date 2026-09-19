// One bottom sheet (a centred dialog on desktop) used for details, pickers and forms.
// Buttons inside use data-action="sheet" data-handler="<name>"; whoever opens the sheet supplies the handlers.
import { icon } from "./icons.js";
import { $, esc } from "./ui.js";

let handlers = {};
let onClose = null;

export function openSheet({ title, html, handlers: sheetHandlers = {}, onOpen, onClose: closeCallback }) {
  handlers = sheetHandlers;
  onClose = closeCallback ?? null;
  const root = $("#sheet");
  root.innerHTML = `<div class="sheet-backdrop" data-action="sheet-close"></div>
    <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2 class="sheet-title">${esc(title)}</h2>
        <button class="icon-btn" data-action="sheet-close" aria-label="關閉">${icon("close")}</button></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  root.hidden = false;
  document.body.classList.add("sheet-open");
  onOpen?.($(".sheet-body", root));
}

/** Re-renders the body of the open sheet, keeping its handlers. */
export function updateSheet(html) {
  const body = $("#sheet .sheet-body");
  if (body) body.innerHTML = html;
  return body;
}

export function closeSheet() {
  const root = $("#sheet");
  if (root.hidden) return;
  root.hidden = true;
  root.innerHTML = "";
  document.body.classList.remove("sheet-open");
  handlers = {};
  const callback = onClose;
  onClose = null;
  callback?.();
}

export const actions = {
  "sheet-close": () => closeSheet(),
  sheet: (data, el) => handlers[data.handler]?.(data, el),
};

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSheet();
});
