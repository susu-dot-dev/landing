import { describe, expect, test } from "@rstest/core";
import {
  applyThemeMode,
  isThemeMode,
  readThemeMode,
  resolveDark,
  THEME_STORAGE_KEY,
} from "./theme";

const storageWith = (value: string | null) => ({ getItem: () => value });
const throwingStorage = () => {
  throw new Error("storage unavailable");
};

describe("isThemeMode", () => {
  test.each(["light", "dark", "system"])("accepts %s", (value) => {
    expect(isThemeMode(value)).toBe(true);
  });

  test.each(["", "blue", null, undefined, 1])("rejects %s", (value) => {
    expect(isThemeMode(value)).toBe(false);
  });
});

describe("readThemeMode", () => {
  test("returns a stored mode", () => {
    expect(readThemeMode(storageWith("dark"))).toBe("dark");
  });

  test("falls back to system for missing or invalid values", () => {
    expect(readThemeMode(storageWith(null))).toBe("system");
    expect(readThemeMode(storageWith("blue"))).toBe("system");
  });

  test("falls back to system when storage throws", () => {
    expect(readThemeMode({ getItem: throwingStorage })).toBe("system");
  });

  test("reads localStorage by default", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(readThemeMode()).toBe("light");
    localStorage.clear();
  });
});

describe("resolveDark", () => {
  test("explicit modes ignore the system preference", () => {
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("light", true)).toBe(false);
  });

  test("system follows the preference", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
  });
});

describe("applyThemeMode", () => {
  test("toggles the dark class and stores the mode", () => {
    const root = document.createElement("html");
    const values = new Map<string, string>();
    const storage = { setItem: (k: string, v: string) => void values.set(k, v) };

    applyThemeMode("dark", { root, storage, prefersDark: false });
    expect(root.classList.contains("dark")).toBe(true);
    expect(values.get(THEME_STORAGE_KEY)).toBe("dark");

    applyThemeMode("light", { root, storage, prefersDark: true });
    expect(root.classList.contains("dark")).toBe(false);
  });

  test("still applies the theme when storage throws", () => {
    const root = document.createElement("html");
    applyThemeMode("dark", { root, storage: { setItem: throwingStorage }, prefersDark: false });
    expect(root.classList.contains("dark")).toBe(true);
  });

  test("uses the document, localStorage and matchMedia by default", () => {
    applyThemeMode("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    applyThemeMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    localStorage.clear();
  });
});
