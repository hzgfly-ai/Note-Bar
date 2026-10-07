import { Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { PanelAppearance } from "../window/panel-types";

declare global { interface Window { __pebbleAppearance?: { apply(appearance: PanelAppearance): void } } }
export const darkTheme = new Compartment();
export function setupAppearance(view: EditorView): void {
	window.__pebbleAppearance = { apply(appearance) {
		document.body.dataset.pebbleTheme = appearance.theme;
		document.body.dataset.pebbleGlass = String(appearance.glass);
		view.dispatch({ effects: darkTheme.reconfigure(EditorView.theme({}, { dark: appearance.theme === "dark" })) });
	} };
}
