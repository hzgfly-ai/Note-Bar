import editorTemplate from "../editor/editor-template.html";
import editorStyles from "../editor/editor.css";
import editorScriptBundle from "pebble:editor-script";
import { PebbleThemeMode } from "../settings";

/**
 * Builds the complete HTML document string for the standalone Pebble editor.
 */
export function buildEditorHTML(
	initialContent: string,
	noteTitle: string,
	showNoteTitle: boolean,
	themeMode: PebbleThemeMode,
): string {
	const normalizedTheme = themeMode === "light" ? "light" : "dark";
	const themeBodyAttr = `data-pebble-theme="${normalizedTheme}"`;
	const escapedNoteTitleForHtml = noteTitle
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	// Notes can contain HTML/script examples. They must remain plain text even
	// when placed in an inline script in the standalone panel document.
	const serializedInitialContent = JSON.stringify(initialContent).replace(
		/</g,
		"\\u003c",
	);
	const editorScript =
		`window.__pebbleInitialContent = ${serializedInitialContent};\n` +
		editorScriptBundle.replace(/<\/script/gi, "<\\/script");

	const replacements: Record<string, string> = {
		__EDITOR_STYLE__: editorStyles,
		__THEME_BODY_ATTR__: themeBodyAttr,
		__NOTE_TITLE_HIDDEN_ATTR__: showNoteTitle ? "" : "hidden",
		__NOTE_TITLE__: escapedNoteTitleForHtml,
		__EDITOR_SCRIPT__: editorScript,
	};
	// Replace template tokens in one pass so tokens inside a note stay literal.
	return editorTemplate.replace(
		/__EDITOR_STYLE__|__THEME_BODY_ATTR__|__NOTE_TITLE_HIDDEN_ATTR__|__NOTE_TITLE__|__EDITOR_SCRIPT__/g,
		(token) => replacements[token]!,
	);
}
