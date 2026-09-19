// Chinese / English. Strings are written as pairs where they are used — L("說一句話", "Describe it") — so both
// versions sit side by side and stay in sync. Switching language reloads the page, which also re-requests the
// server's texts (reasons, insights) in the new language.
const KEY = "lang";

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // storage unavailable: fall back to the browser language
  }
  return (navigator.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** "zh" | "en" for this page load. */
export const lang = initialLang();

/** Picks the string for the current language. */
export const L = (zh, en) => (lang === "en" ? en : zh);

export function setLang(next) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // not remembered, but still switch for this load
  }
  location.reload();
}

/**
 * Translates static HTML: elements with data-en get that text, data-en-placeholder / data-en-aria set the
 * placeholder / aria-label. Chinese is what the HTML already says.
 */
export function translateStatic(root = document) {
  document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
  if (lang !== "en") return;
  for (const el of root.querySelectorAll("[data-en]")) el.textContent = el.dataset.en;
  for (const el of root.querySelectorAll("[data-en-placeholder]")) el.placeholder = el.dataset.enPlaceholder;
  for (const el of root.querySelectorAll("[data-en-aria]")) el.setAttribute("aria-label", el.dataset.enAria);
  for (const el of root.querySelectorAll("[data-en-content]")) el.setAttribute("content", el.dataset.enContent);
}
