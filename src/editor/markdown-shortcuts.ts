import { StateCommand, Transaction } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/** Preserve Pebble's convenient code-fence pairing on Enter. */
export const insertClosingFence: StateCommand = ({ state, dispatch }) => {
	const selection = state.selection.main;
	if (!selection.empty || state.selection.ranges.length !== 1) return false;
	const line = state.doc.lineAt(selection.head);
	if (selection.head !== line.to) return false;
	const match = /^([\t ]*)(`{3,}|~{3,})([\w+-]*)$/.exec(line.text);
	if (!match) return false;
	let node = syntaxTree(state).resolveInner(selection.head, -1);
	while (node.parent && node.name !== "FencedCode") node = node.parent;
	if (node.name !== "FencedCode" || state.doc.lineAt(node.from).number !== line.number || node.getChildren("CodeMark").length > 1) return false;
	const indent = match[1]!;
	dispatch(state.update({
		changes: { from: line.to, insert: `\n${indent}\n${indent}${match[2]!}` },
		selection: { anchor: line.to + 1 + indent.length },
		annotations: Transaction.userEvent.of("input"),
	}));
	return true;
};

/** Typing "[ ] " or "[x] " starts a task, as in the original editor. */
export const expandTaskShortcut: StateCommand = ({ state, dispatch }) => {
	const selection = state.selection.main;
	if (!selection.empty || state.selection.ranges.length !== 1) return false;
	const line = state.doc.lineAt(selection.head);
	const before = state.doc.sliceString(line.from, selection.head);
	const match = /^([\t ]*)\[( |x|X)?\]$/.exec(before);
	if (!match) return false;
	for (let node = syntaxTree(state).resolveInner(selection.head, -1); node; node = node.parent!) {
		if (node.name === "FencedCode" || node.name === "CodeBlock") return false;
	}
	const text = `${match[1]!}- [${match[2]?.toLowerCase() === "x" ? "x" : " "}] `;
	dispatch(state.update({
		changes: { from: line.from, to: selection.head, insert: text },
		selection: { anchor: line.from + text.length },
		annotations: Transaction.userEvent.of("input"),
	}));
	return true;
};
