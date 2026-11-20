export type ThemeMode = "light" | "dark" | "system";

// Keep in sync with the inline script in src/index.html.
export const THEME_STORAGE_KEY = "susu-theme";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemeMode(storage: Pick<Storage, "getItem"> = localStorage): ThemeMode {
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveDark(mode: ThemeMode, prefersDark: boolean): boolean {
  return mode === "dark" || (mode === "system" && prefersDark);
}

export function applyThemeMode(
  mode: ThemeMode,
  {
    root = document.documentElement,
    storage = localStorage,
    prefersDark = matchMedia("(prefers-color-scheme: dark)").matches,
  }: {
    root?: HTMLElement;
    storage?: Pick<Storage, "setItem">;
    prefersDark?: boolean;
  } = {},
): void {
  root.classList.toggle("dark", resolveDark(mode, prefersDark));
  try {
    storage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies.
  }
}
