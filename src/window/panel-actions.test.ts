import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
	class File { extension = "md"; basename: string; constructor(public path: string) { this.basename = path.split("/").pop()!.replace(/\.md$/, ""); } }
	class Folder { constructor(public path: string) {} }
	return { File, Folder, copy: vi.fn() };
});
vi.mock("obsidian", () => ({ App: class {}, Notice: class {}, TFile: mocks.File, TFolder: mocks.Folder, normalizePath: (path: string) => path }));
vi.mock("./editor-html", () => ({ buildEditorHTML: () => "" }));
import { NativeWindow } from "./native-window";
import { DEFAULT_SETTINGS } from "../settings";
import type { App, TFile } from "obsidian";
import { NoteSession } from "./note-session";
import type { PanelRequest, PanelResponse } from "./panel-types";
vi.mock("../settings", () => ({ DEFAULT_SETTINGS: { notePath: "", windowPositions: {} } }));
interface TestPanel { session: NoteSession<TFile>; handleAction(request: PanelRequest): Promise<void>; respond(response: PanelResponse): Promise<void> }
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("window", { require: () => ({ clipboard: { writeText: mocks.copy } }) }); });
function fixture() {
	const a = new mocks.File("A.md"); const b = new mocks.File("目录/B.md");
	const folder = new mocks.Folder("默认目录"); const store = new Map([[a.path, "A"], [b.path, "B"]]);
	const dailyFile = new mocks.File("日记/今日.md");
	const create = vi.fn(async () => { const file = new mocks.File("默认目录/未命名.md"); store.set(file.path, ""); return file; });
	const today = vi.fn(async () => { store.set(dailyFile.path, "日记模板"); return dailyFile; });
	const process = vi.fn(async (file: InstanceType<typeof mocks.File>, update: (content: string) => string) => { store.set(file.path, update(store.get(file.path)!)); });
	const app = {
		vault: { process, read: async (file: InstanceType<typeof mocks.File>) => store.get(file.path), getAbstractFileByPath: (path: string) => [a, b].find((file) => file.path === path), getMarkdownFiles: () => [a, b], getAllLoadedFiles: () => [folder] },
		workspace: { getActiveFile: () => null },
		fileManager: { getNewFileParent: vi.fn(() => folder), createNewMarkdownFile: create },
		internalPlugins: { getEnabledPluginById: () => ({ getDailyNote: today }) },
	};
	const panel = new NativeWindow(app as unknown as App, () => ({ ...DEFAULT_SETTINGS }), async () => {}) as unknown as TestPanel;
	const responses: PanelResponse[] = []; panel.respond = async (response) => { responses.push(response); };
	// eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast -- Test double from the mocked Obsidian module.
	panel.session.load(a as unknown as TFile, "A");
	const request = (action: PanelRequest["action"], extra = {}): PanelRequest => ({ id: 1, action, path: "A.md", content: "A edited", ...extra });
	return { panel, a, b, folder, store, create, today, process, responses, request, app };
}
describe("panel actions", () => {
	it("saves A before loading B and writes further edits only to B", async () => {
		const f = fixture(); await f.panel.handleAction(f.request("select", { target: f.b.path }));
		expect(f.store.get("A.md")).toBe("A edited"); expect(f.panel.session.file).toBe(f.b);
		f.panel.session.queue("B edited"); await f.panel.session.flush();
		expect(f.store.get(f.b.path)).toBe("B edited"); expect(f.responses[0]?.changeNote).toBe(true);
	});
	it("does not switch when saving the original note fails", async () => {
		const f = fixture(); f.process.mockRejectedValueOnce(new Error("disk full"));
		await f.panel.handleAction(f.request("select", { target: f.b.path }));
		expect(f.panel.session.file).toBe(f.a); expect(f.responses[0]?.error).toContain("disk full");
	});
	it("uses native new-note creation with the configured folder and default title", async () => {
		const f = fixture(); await f.panel.handleAction(f.request("create", { name: "" }));
		expect(f.app.fileManager.getNewFileParent).toHaveBeenCalledWith("A.md", "新笔记.md");
		expect(f.create).toHaveBeenCalledWith(f.folder, undefined);
	});
	it("uses the core daily-note implementation, including its template result", async () => {
		const f = fixture(); await f.panel.handleAction(f.request("daily"));
		expect(f.today).toHaveBeenCalledOnce(); expect(f.panel.session.content).toBe("日记模板");
	});
	it("copies exactly the unsaved raw Markdown even if disk saving would fail", async () => {
		const f = fixture(); await f.panel.handleAction(f.request("copy", { content: "# 标题\n![[图片.png]]\n" }));
		expect(mocks.copy).toHaveBeenCalledWith("# 标题\n![[图片.png]]\n"); expect(f.process).not.toHaveBeenCalled();
	});
	it("rejects stale note requests instead of writing content into another file", async () => {
		const f = fixture(); await f.panel.handleAction(f.request("select", { path: "旧文件.md", target: f.b.path }));
		expect(f.process).not.toHaveBeenCalled(); expect(f.panel.session.file).toBe(f.a);
	});
	it("keeps the current note when daily notes is disabled", async () => {
		const f = fixture(); f.app.internalPlugins.getEnabledPluginById = () => undefined as never;
		await f.panel.handleAction(f.request("daily"));
		expect(f.panel.session.file).toBe(f.a); expect(f.responses[0]?.error).toContain("启用核心插件");
	});
	it("rejects paths in new note names instead of creating unexpected directories", async () => {
		const f = fixture(); await f.panel.handleAction(f.request("create", { name: "../其他笔记" }));
		expect(f.create).not.toHaveBeenCalled(); expect(f.responses[0]?.error).toContain("特殊字符");
	});

});
