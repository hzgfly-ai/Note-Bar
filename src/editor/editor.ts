import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, drawSelection, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory } from "@codemirror/commands";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import {
	deleteMarkupBackward,
	insertNewlineContinueMarkupCommand,
	markdown,
	markdownLanguage,
} from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import { setupPanel } from "./panel-controls";
import { listLayout } from "./list-layout";
import { expandTaskShortcut, insertClosingFence } from "./markdown-shortcuts";
import { MediaBridge } from "./media-bridge";
import { imagePreview, refreshImages } from "./image-preview";
import { darkTheme, setupAppearance } from "./appearance";

declare global {
	interface Window {
		__pebbleInitialContent?: string;
		__pebbleEditor?: {
			getContent(): string;
			setContent(content: string): void;
			refreshImages(): void;
		};
	}
}

const externalUpdate = Annotation.define<boolean>();
const highlights = HighlightStyle.define([
	{ tag: tags.heading1, fontSize: "1.3em", fontWeight: "650" },
	{ tag: tags.heading2, fontSize: "1.15em", fontWeight: "650" },
	{ tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: "650" },
	{ tag: tags.strong, fontWeight: "650" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{ tag: tags.link, color: "var(--pebble-editor-link-color)", textDecoration: "underline" },
	{ tag: tags.monospace, fontFamily: "Menlo, monospace", backgroundColor: "var(--pebble-editor-code-bg)" },
	{ tag: tags.url, color: "var(--pebble-editor-muted-color)" },
	{
		tag: [tags.processingInstruction, tags.atom],
		color: "var(--pebble-editor-syntax-color)",
		fontFamily: '"SFMono-Regular", Menlo, monospace',
		fontWeight: "400",
		fontStyle: "normal",
	},
]);

const parent = document.getElementById("editor");
if (parent) {
	const readOnly = new Compartment();
	const media = new MediaBridge();
	let pastePending: Promise<void> | null = null;
	let showStatus = (message: string, error = false): void => {
		const element = document.getElementById("panel-status")!; element.textContent = message; element.dataset.error = String(error);
	};
	let getPath = () => window.__pebbleInitialPanel?.path ?? "";
	const extensions = [
		readOnly.of(EditorState.readOnly.of(false)),
		darkTheme.of(EditorView.theme({}, { dark: document.body.dataset.pebbleTheme === "dark" })),
		imagePreview({ media, getPath: () => getPath(), status: (message, error) => showStatus(message, error) }),
				markdown({ base: markdownLanguage, addKeymap: false, completeHTMLTags: false, pasteURLAsLink: false }),
				syntaxHighlighting(highlights),
				listLayout,
				EditorState.tabSize.of(4),
				indentUnit.of("    "),
				history(),
				drawSelection(),
				EditorView.lineWrapping,
				placeholder("开始记录…"),
				EditorView.contentAttributes.of({ "aria-label": "Markdown 速记", spellcheck: "true" }),
				keymap.of([
					{ key: "Enter", run: insertClosingFence },
					{ key: "Enter", run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
					{ key: "Backspace", run: deleteMarkupBackward },
					{ key: " ", run: expandTaskShortcut },
					indentWithTab,
					...defaultKeymap,
					...historyKeymap,
				]),
				EditorView.updateListener.of((update) => {
					if (update.docChanged && !update.transactions.some((tr) => tr.annotation(externalUpdate))) {
						// The standalone panel uses Electron console-message as its save bridge.
						console.debug("__pebble_save:" + JSON.stringify({ path: getPath(), content: update.state.doc.toString() }));
					}
				}),
	];
	const view = new EditorView({ parent, state: EditorState.create({ doc: window.__pebbleInitialContent ?? "", extensions }) });
	const panel = setupPanel({
		getContent: () => view.state.doc.toString(),
		setBusy: (busy) => view.dispatch({ effects: readOnly.reconfigure([EditorState.readOnly.of(busy), EditorView.editable.of(!busy)]) }),
		setNote: (content) => {
			media.clear(); view.setState(EditorState.create({ doc: content, extensions }));
			view.dispatch({ effects: darkTheme.reconfigure(EditorView.theme({}, { dark: document.body.dataset.pebbleTheme === "dark" })) });
		},
		focus: () => view.focus(),
		whenIdle: async () => { if (pastePending) await pastePending; },
	});
	getPath = () => panel.getPath(); showStatus = (message, error) => panel.status(message, error);
	setupAppearance(view);
	view.contentDOM.addEventListener("paste", (event: ClipboardEvent) => {
		const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
		if (!files.length || view.state.readOnly || view.composing || pastePending) return;
		event.preventDefault(); event.stopImmediatePropagation();
		const path = getPath(); const selection = view.state.selection.main; const before = view.state.doc.toString();
		panel.lockMedia(true); showStatus("正在保存图片…");
		pastePending = (async () => {
			const links: string[] = [];
			try {
				for (const file of files) links.push(await media.paste(path, file));
			} catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
			if (links.length && path === getPath() && view.state.doc.toString() === before) {
				const prefix = selection.from > 0 && view.state.doc.sliceString(selection.from - 1, selection.from) !== "\n" ? "\n" : "";
				const suffix = selection.to < view.state.doc.length && view.state.doc.sliceString(selection.to, selection.to + 1) === "\n" ? "" : "\n";
				const insert = prefix + links.join("\n") + suffix;
				view.dispatch({ changes: { from: selection.from, to: selection.to, insert }, selection: { anchor: selection.from + insert.length }, userEvent: "input.paste", annotations: isolateHistory.of("full") });
				if (links.length === files.length) showStatus("图片已保存，可拖动右下角调整大小");
			} else if (links.length) showStatus("笔记已变化；图片已保存到附件目录，请从 Obsidian 插入。", true);
		})().finally(() => { pastePending = null; panel.lockMedia(false); });
	}, { capture: true });

	window.__pebbleEditor = {
		getContent: () => view.state.doc.toString(),
		refreshImages() { media.clear(); view.dispatch({ effects: refreshImages.of(null) }); },
		setContent(content) {
			if (typeof content !== "string" || content === view.state.doc.toString()) return;
			const selection = view.state.selection.main;
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: content },
				selection: { anchor: Math.min(selection.anchor, content.length), head: Math.min(selection.head, content.length) },
				annotations: [externalUpdate.of(true), Transaction.addToHistory.of(false)],
			});
		},
	};
	window.addEventListener("pagehide", () => { media.destroy(); view.destroy(); }, { once: true });
	view.focus();
}
