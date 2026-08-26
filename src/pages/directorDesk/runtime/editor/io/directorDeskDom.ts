let directorDeskHost: HTMLElement | null = null;
let directorDeskPortalTarget: ShadowRoot | null = null;

export function registerDirectorDeskDom(host: HTMLElement, portalTarget: ShadowRoot) {
  directorDeskHost = host;
  directorDeskPortalTarget = portalTarget;
}

export function unregisterDirectorDeskDom(host: HTMLElement) {
  if (directorDeskHost !== host) return;
  directorDeskHost = null;
  directorDeskPortalTarget = null;
}

export function getDirectorDeskThemeElement() {
  return directorDeskHost ?? document.documentElement;
}

export function getDirectorDeskPortalTarget() {
  return directorDeskPortalTarget ?? document.body;
}

export function getDirectorDeskQueryRoot(): Document | ShadowRoot {
  return directorDeskPortalTarget ?? document;
}

export function getDirectorDeskEventTarget(event: Event) {
  return event.composedPath()[0] ?? event.target;
}

export function isDirectorDeskEventInside(event: Event, node: Node | null | undefined) {
  return Boolean(node && event.composedPath().includes(node));
}

export function applyDirectorDeskTheme(theme: "dark" | "light") {
  const themeElement = getDirectorDeskThemeElement();
  themeElement.dataset.theme = theme;
  themeElement.classList.toggle("dark", theme === "dark");
}
