import { countColumn, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";

/** Only decorate parsed list items: list-like text inside code stays untouched. */
export function listPrefixes(state: EditorState, from = 0, to = state.doc.length) {
	const prefixes = new Map<number, { from: number; to: number; columns: number }>();
	syntaxTree(state).iterate({
		from,
		to,
		enter(node) {
			if (node.name !== "ListItem") return;
			const line = state.doc.lineAt(node.from);
			const match = /^[\t ]*(?:[-+*]|\d+[.)])[\t ]+(?:\[[ xX]\][\t ]+)?/.exec(line.text);
			if (!match) return;
			prefixes.set(line.from, {
				from: line.from,
				to: line.from + match[0].length,
				columns: countColumn(match[0], state.tabSize),
			});
		},
	});
	return [...prefixes.values()];
}

export const listLayout = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		private characterWidth: number;

		constructor(view: EditorView) {
			const font = getComputedStyle(view.contentDOM);
			const canvas = view.dom.ownerDocument.createElement("canvas");
			const context = canvas.getContext("2d");
			if (context) context.font = `${font.fontSize} Menlo, monospace`;
			this.characterWidth = (context?.measureText("0").width || view.defaultCharacterWidth) + (parseFloat(font.letterSpacing) || 0);
			this.decorations = this.build(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
				this.decorations = this.build(update.view);
			}
		}

		private build(view: EditorView): DecorationSet {
			const ranges = [];
			for (const prefix of listPrefixes(view.state, view.viewport.from, view.viewport.to)) {
				const width = prefix.columns * this.characterWidth;
				ranges.push(
					Decoration.line({
						attributes: {
							class: "pebble-list-line",
							style: `padding-left: ${width}px; text-indent: -${width}px;`,
						},
					}).range(prefix.from),
					Decoration.mark({ class: "pebble-list-prefix" }).range(prefix.from, prefix.to),
				);
			}
			return Decoration.set(ranges, true);
		}
	},
	{ decorations: (plugin) => plugin.decorations },
);
