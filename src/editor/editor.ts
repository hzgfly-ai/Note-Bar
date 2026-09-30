import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, drawSelection, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
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

declare global {
	interface Window {
		__pebbleInitialContent?: string;
		__pebbleEditor?: {
			getContent(): string;
			setContent(content: string): void;
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
		color: "var(--pebble-editor-muted-color)",
		fontWeight: "400",
		fontStyle: "normal",
	},
]);

const parent = document.getElementById("editor");
if (parent) {
	const readOnly = new Compartment();
	let getPath = () => window.__pebbleInitialPanel?.path ?? "";
	const extensions = [
		readOnly.of(EditorState.readOnly.of(false)),
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
	getPath = setupPanel({
		getContent: () => view.state.doc.toString(),
		setBusy: (busy) => view.dispatch({ effects: readOnly.reconfigure([EditorState.readOnly.of(busy), EditorView.editable.of(!busy)]) }),
		setNote: (content) => view.setState(EditorState.create({ doc: content, extensions })),
		focus: () => view.focus(),
	});

	window.__pebbleEditor = {
		getContent: () => view.state.doc.toString(),
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
	window.addEventListener("pagehide", () => view.destroy(), { once: true });
	view.focus();
}
