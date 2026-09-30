import { describe, expect, it } from "vitest";
import { EditorState, StateCommand, Transaction } from "@codemirror/state";
import { history, indentLess, indentMore, undo } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { markdown, markdownLanguage, insertNewlineContinueMarkupCommand } from "@codemirror/lang-markdown";
import { listPrefixes } from "./list-layout";
import { expandTaskShortcut, insertClosingFence } from "./markdown-shortcuts";

function editor(doc: string, cursor = doc.length) {
	let state = EditorState.create({
		doc,
		selection: { anchor: cursor },
		extensions: [markdown({ base: markdownLanguage }), indentUnit.of("    "), EditorState.tabSize.of(4), history()],
	});
	return {
		get state() { return state; },
		run(command: StateCommand) {
			return command({ state, dispatch: (transaction: Transaction) => { state = transaction.state; } });
		},
	};
}

const enter = insertNewlineContinueMarkupCommand({ nonTightLists: false });

describe("Markdown editing", () => {
	it("pairs an opening code fence and places the cursor inside", () => {
		const e = editor("```js");
		expect(e.run(insertClosingFence)).toBe(true);
		expect(e.state.doc.toString()).toBe("```js\n\n```");
		expect(e.state.selection.main.head).toBe(6);
	});

	it("does not duplicate an existing closing fence", () => {
		const e = editor("```js\n\n```", 5);
		expect(e.run(insertClosingFence)).toBe(false);
	});

	it("preserves the task shorthand without changing code samples", () => {
		const e = editor("[ ]");
		expect(e.run(expandTaskShortcut)).toBe(true);
		expect(e.state.doc.toString()).toBe("- [ ] ");
		const code = editor("```md\n[ ]");
		expect(code.run(expandTaskShortcut)).toBe(false);
	});

	it("continues nested ordered numbers and keeps their indentation", () => {
		const e = editor("1. 父项\n    1. 子项");
		expect(e.run(enter)).toBe(true);
		expect(e.state.doc.toString()).toBe("1. 父项\n    1. 子项\n    2. ");
	});

	it("continues a checked task as unchecked", () => {
		const e = editor("- [x] 完成");
		e.run(enter);
		expect(e.state.doc.toString()).toBe("- [x] 完成\n- [ ] ");
	});

	it("exits an empty list item on Enter", () => {
		const e = editor("- 第一项\n- ");
		e.run(enter);
		expect(e.state.doc.toString()).toBe("- 第一项\n");
	});

	it("indents and outdents a list line without changing its content", () => {
		const e = editor("- 第一项\n- 子项");
		e.run(indentMore);
		expect(e.state.doc.toString()).toBe("- 第一项\n    - 子项");
		e.run(indentLess);
		expect(e.state.doc.toString()).toBe("- 第一项\n- 子项");
	});

	it("supports undo for Markdown list continuation", () => {
		const e = editor("1. 内容");
		e.run(enter);
		e.run(undo);
		expect(e.state.doc.toString()).toBe("1. 内容");
	});

	it("aligns nested list and task continuations to their body columns", () => {
		const e = editor("- 父项\n    - [ ] 子任务\n\n10. 有序项");
		expect(listPrefixes(e.state).map((p) => p.columns)).toEqual([2, 10, 4]);
	});

	it("counts a tab as four columns in list layout", () => {
		const e = editor("- 父项\n\t- 子项");
		expect(listPrefixes(e.state).map((p) => p.columns)).toEqual([2, 6]);
	});

	it("does not treat Markdown examples in fenced code as real lists", () => {
		const e = editor("```md\n- 示例\n    1. 示例\n```\n\n- 真正的列表");
		expect(listPrefixes(e.state)).toHaveLength(1);
		expect(e.state.doc.sliceString(listPrefixes(e.state)[0]!.from)).toBe("- 真正的列表");
	});
});
