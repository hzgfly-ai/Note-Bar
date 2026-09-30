import { App, TFile, TFolder } from "obsidian";

// These creation methods are internal Obsidian APIs. Keep them behind runtime
// guards: never fall back to a different daily-note or template convention.
interface NativeFileManager {
	createNewMarkdownFile?: (folder: TFolder, name?: string) => Promise<TFile>;
}
interface DailyNotesPlugin {
	getDailyNote?: () => Promise<TFile | null | undefined>;
}
interface CorePlugins {
	getEnabledPluginById?: (id: string) => DailyNotesPlugin | undefined;
}

export class NoteService {
	constructor(private app: App) {}

	private dailyPlugin(): DailyNotesPlugin | undefined {
		return (this.app as App & { internalPlugins?: CorePlugins }).internalPlugins
			?.getEnabledPluginById?.("daily-notes");
	}

	dailyAvailable(): boolean {
		return typeof this.dailyPlugin()?.getDailyNote === "function";
	}

	newNoteFolder(sourcePath: string): TFolder {
		return this.app.fileManager.getNewFileParent(sourcePath, "新笔记.md");
	}

	async createNote(sourcePath: string, name: string): Promise<TFile> {
		const trimmed = name.trim();
		if (/[\\/:*?"<>|]/.test(trimmed) || [...trimmed].some((char) => char.charCodeAt(0) < 32) || trimmed === "." || trimmed === "..") {
			throw new Error("笔记名称不能包含路径或特殊字符。");
		}
		const manager = this.app.fileManager as typeof this.app.fileManager & NativeFileManager;
		if (typeof manager.createNewMarkdownFile !== "function") {
			throw new Error("当前 Obsidian 版本的新建笔记接口不可用。");
		}
		const file = await manager.createNewMarkdownFile(this.newNoteFolder(sourcePath), trimmed || undefined);
		if (!(file instanceof TFile)) throw new Error("Obsidian 未能创建笔记。");
		return file;
	}

	async today(): Promise<TFile> {
		const plugin = this.dailyPlugin();
		if (typeof plugin?.getDailyNote !== "function") {
			throw new Error("请先在 Obsidian 中启用核心插件「日记」。");
		}
		const file = await plugin.getDailyNote();
		if (!(file instanceof TFile)) {
			throw new Error("无法创建日记，请检查 Obsidian 的日记目录和模板设置。");
		}
		return file;
	}
}
