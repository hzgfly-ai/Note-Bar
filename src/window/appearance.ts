import type { PebbleThemeMode } from "../settings";
export function resolveTheme(mode: PebbleThemeMode, obsidianDark: boolean): "light" | "dark" {
	return mode === "auto" ? (obsidianDark ? "dark" : "light") : mode;
}
