export interface NoteTree { name: string; path: string; folders: NoteTree[]; files: string[] }
export function buildNoteTree(files: string[], folders: string[] = []): NoteTree {
	const root: NoteTree = { name: "仓库", path: "", folders: [], files: [] };
	const nodes = new Map([["", root]]);
	const ensure = (path: string): NoteTree => {
		if (path === "/") return root;
		const existing = nodes.get(path);
		if (existing) return existing;
		const parts = path.split("/"); const name = parts.pop()!;
		const parent = ensure(parts.join("/"));
		const node: NoteTree = { name, path, folders: [], files: [] };
		parent.folders.push(node); nodes.set(path, node); return node;
	};
	for (const folder of folders) ensure(folder);
	for (const file of files) ensure(file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "").files.push(file);
	const sort = (node: NoteTree): void => {
		node.folders.sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
		node.files.sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true })); node.folders.forEach(sort);
	};
	sort(root); return root;
}
