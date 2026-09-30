import type { PanelRequest, PanelResponse, PanelSnapshot } from "../window/panel-types";
import { buildNoteTree, NoteTree } from "./note-tree";
interface EditorAccess { getContent(): string; setNote(content: string): void; setBusy(busy: boolean): void; focus(): void }
declare global {
	interface Window {
		__pebbleInitialPanel?: PanelSnapshot | null;
		__pebblePanel?: { apply(response: PanelResponse): void; pause(): string };
	}
}
export function setupPanel(editor: EditorAccess): () => string {
	let snapshot = window.__pebbleInitialPanel ?? { path: "", title: "选择笔记", content: "", files: [], folders: [], newNoteFolder: "/", dailyNotesAvailable: false };
	let pending = 0; let counter = 0;
	const toolbar = document.getElementById("toolbar")!;
	const select = document.getElementById("select-note") as HTMLButtonElement;
	const daily = document.getElementById("daily-note") as HTMLButtonElement;
	const overlay = document.getElementById("note-picker")!;
	const search = document.getElementById("note-search") as HTMLInputElement;
	const list = document.getElementById("note-list")!;
	const form = document.getElementById("new-note-form") as HTMLFormElement;
	const name = document.getElementById("new-note-name") as HTMLInputElement;
	const location = document.getElementById("new-note-location")!;
	const status = document.getElementById("panel-status")!;
	let mode: "picker" | "create" | null = null;
	const busy = (value: boolean): void => {
		editor.setBusy(value || !snapshot.path);
		toolbar.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = value; });
		overlay.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = value; });
		name.disabled = value; search.disabled = value;
		if (!value) daily.disabled = !snapshot.dailyNotesAvailable;
	};
	const close = (): void => { overlay.hidden = true; mode = null; editor.focus(); };
	const send = (action: PanelRequest["action"], extra: Partial<PanelRequest> = {}): void => {
		if (pending) return;
		pending = ++counter; busy(true); status.textContent = "";
		console.debug("__pebble_action:" + JSON.stringify({ id: pending, action, path: snapshot.path, content: editor.getContent(), ...extra }));
	};
	const fileButton = (path: string, fullPath = false): HTMLButtonElement => {
		const button = document.createElement("button"); button.type = "button"; button.className = "note-option";
		button.textContent = (fullPath ? path : path.split("/").pop()!).replace(/\.md$/, ""); button.title = path;
		button.setAttribute("aria-current", path === snapshot.path ? "true" : "false");
		button.addEventListener("click", () => send("select", { target: path })); return button;
	};
	const appendTree = (node: NoteTree, parent: HTMLElement): void => {
		for (const folder of node.folders) {
			const details = document.createElement("details"); details.open = snapshot.path.startsWith(folder.path + "/");
			const summary = document.createElement("summary"); summary.textContent = folder.name; details.append(summary);
			const children = document.createElement("div"); children.className = "folder-children";
			appendTree(folder, children); details.append(children); parent.append(details);
		}
		for (const path of node.files) parent.append(fileButton(path));
	};
	const renderList = (): void => {
		list.replaceChildren(); const query = search.value.trim().toLocaleLowerCase();
		if (query) { for (const path of snapshot.files.filter((path) => path.toLocaleLowerCase().includes(query))) list.append(fileButton(path, true)); }
		else appendTree(buildNoteTree(snapshot.files, snapshot.folders), list);
		if (!list.childElementCount) list.textContent = query ? "没有匹配的笔记" : "仓库中还没有笔记";
	};
	const metadata = (): void => {
		select.textContent = snapshot.title + " ▾"; select.title = snapshot.path || "选择仓库笔记";
		daily.disabled = !!pending || !snapshot.dailyNotesAvailable;
		daily.title = snapshot.dailyNotesAvailable ? "按 Obsidian 日记设置创建或打开今日笔记" : "请先在 Obsidian 中启用核心插件「日记」";
		document.getElementById("note-title")!.textContent = snapshot.title;
		location.textContent = "保存到：" + (snapshot.newNoteFolder === "/" || !snapshot.newNoteFolder ? "仓库根目录" : snapshot.newNoteFolder) + "（跟随 Obsidian 设置）";
		if (mode === "picker") renderList();
	};
	select.addEventListener("click", () => {
		if (mode === "picker") { close(); return; }
		mode = "picker"; overlay.hidden = false; form.hidden = true;
		document.getElementById("picker-body")!.hidden = false; search.value = ""; renderList(); search.focus(); send("list");
	});
	document.getElementById("new-note")!.addEventListener("click", () => {
		mode = "create"; overlay.hidden = false; form.hidden = false;
		document.getElementById("picker-body")!.hidden = true; name.value = ""; metadata(); name.focus(); send("list");
	});
	form.addEventListener("submit", (event) => { event.preventDefault(); send("create", { name: name.value }); });
	daily.addEventListener("click", () => send("daily"));
	document.getElementById("copy-all")!.addEventListener("click", () => send("copy"));
	document.getElementById("close-picker")!.addEventListener("click", close);
	search.addEventListener("input", renderList);
	document.addEventListener("keydown", (event) => { if (event.key === "Escape" && mode && !pending) { event.preventDefault(); close(); } });
	window.__pebblePanel = {
		pause: () => { busy(true); return editor.getContent(); },
		apply(response) {
			if (response.snapshot) { snapshot = response.snapshot; if (response.changeNote) { editor.setNote(snapshot.content); close(); } metadata(); }
			if (response.id === pending || (response.error && !pending)) {
				pending = 0; busy(false);
				if (mode === "create") name.focus(); else if (mode === "picker") search.focus();
			}
			status.textContent = response.error ?? response.message ?? ""; status.dataset.error = response.error ? "true" : "false";
		},
	};
	metadata(); busy(false); return () => snapshot.path;
}
