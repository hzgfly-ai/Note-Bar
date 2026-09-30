import { expect, it } from "vitest";
import { buildNoteTree } from "./note-tree";
it("keeps nested folders, empty folders and duplicate basenames distinct", () => {
	const root = buildNoteTree(["A/子目录/笔记.md", "B/笔记.md", "根笔记.md"], ["/", "A", "B", "空文件夹"]);
	expect(root.files).toEqual(["根笔记.md"]);
	expect(root.folders.find((folder) => folder.path === "A")?.folders[0]?.files).toEqual(["A/子目录/笔记.md"]);
	expect(root.folders.find((folder) => folder.path === "B")?.files).toEqual(["B/笔记.md"]);
	expect(root.folders.find((folder) => folder.path === "空文件夹")?.files).toEqual([]);
});
