import { App, Notice, TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";
import {
	ElectronBrowserWindowInstance,
	ElectronRectangle,
	getRemote,
} from "../electron/utils";
import { buildEditorHTML } from "./editor-html";
import { calculateWindowPosition } from "./position";
import { PebbleSettings } from "../settings";
import { NoteService } from "./note-service";
import { NoteSession } from "./note-session";
import { PanelRequest, PanelResponse, PanelSnapshot } from "./panel-types";

function currentPlatform(): NodeJS.Platform {
	return process.platform;
}

export class NativeWindow {
	private win: ElectronBrowserWindowInstance | null = null;
	private opening = false;
	private app: App;
	private readSettings: () => PebbleSettings;
	private saveSettings: () => Promise<void>;
	private session: NoteSession<TFile>;
	private notes: NoteService;
	private actions: Promise<void> = Promise.resolve();
	private switching = false;
	private closePromise: Promise<void> | null = null;
	private suppressModifyUntil = 0;

	constructor(
		app: App,
		readSettings: () => PebbleSettings,
		saveSettings: () => Promise<void>,
	) {
		this.app = app;
		this.readSettings = readSettings;
		this.saveSettings = saveSettings;
		this.notes = new NoteService(app);
		this.session = new NoteSession(async (file, content) => {
			this.suppressModifyUntil = Date.now() + 1500;
			const active = this.app.workspace.getActiveFile();
			const editor = this.app.workspace.activeEditor?.editor;
			if (active === file && editor) editor.setValue(content);
			await this.app.vault.process(file, () => content);
		});
	}

	async toggle(anchorBounds?: ElectronRectangle): Promise<void> {
		if (this.opening) {
			return;
		}

		if (this.closePromise) {
			await this.closePromise;
		}

		if (this.isOpen()) {
			await this.close();
			return;
		}
		await this.open(anchorBounds);
	}

	async close(): Promise<void> {
		if (this.closePromise) return this.closePromise;
		this.closePromise = this.doClose();
		try {
			await this.closePromise;
		} finally {
			this.closePromise = null;
		}
	}

	private async doClose(): Promise<void> {
		await this.actions;
		try {
			// Pull the editor synchronously before closing, including the final
			// keystroke whose console-message event may still be in transit.
			if (this.win && !this.win.isDestroyed()) {
				const content = await this.win.webContents.executeJavaScript("window.__pebblePanel?.pause()");
				if (typeof content === "string") this.session.queue(content);
			}
			await this.session.flush();
		} catch (error) {
			await this.respond({ error: `保存失败，面板保持打开：${String(error)}` });
			return;
		}
		this.session.load(null, "");
		this.suppressModifyUntil = 0;

		if (!this.win || this.win.isDestroyed()) {
			this.win = null;
			return;
		}

		this.persistWindowBounds(this.win);
		this.win.close();
		this.win = null;
	}

	private persistWindowBounds(win: ElectronBrowserWindowInstance): void {
		try {
			const [x, y] = win.getPosition();
			const [width, height] = win.getSize();
			const settings = this.readSettings();
			settings.windowPositions[currentPlatform()] = { x, y };
			settings.windowWidth = width;
			settings.windowHeight = height;
			void this.saveSettings();
		} catch {
			// Non-critical — ignore if window is already destroyed
		}
	}

	isOpen(): boolean {
		if (!this.win) return false;
		if (this.win.isDestroyed()) {
			this.win = null;
			return false;
		}
		return true;
	}

	refreshCatalog(): void {
		if (this.isOpen() && !this.switching && !this.closePromise) {
			void this.respond({ snapshot: this.snapshot() });
		}
	}

	handleNotePathRenamed(file: TAbstractFile, oldPath: string): void {
		if (this.session.file) {
			this.readSettings().notePath = this.session.file.path;
			void this.saveSettings();
		} else {
			const settings = this.readSettings();
			if (settings.notePath === oldPath || settings.notePath.startsWith(oldPath + "/")) {
				settings.notePath = file.path + settings.notePath.slice(oldPath.length);
				void this.saveSettings();
			}
		}
		this.refreshCatalog();
	}

	onVaultModify(file: TAbstractFile): void {
		if (
			!(file instanceof TFile) ||
			file.extension !== "md" ||
			!this.session.file ||
			file.path !== this.session.file.path ||
			!this.isOpen() ||
			this.session.isSaving || this.session.dirty || this.switching ||
			Date.now() < this.suppressModifyUntil
		) {
			return;
		}

		void this.reloadEditorFromVault(file).catch((error: unknown) => this.respond({ error: `读取失败：${String(error)}` }));
	}

	private async open(anchorBounds?: ElectronRectangle): Promise<void> {
		if (this.opening || this.isOpen() || this.closePromise) {
			return;
		}

		this.opening = true;
		const noteFile = this.resolveNoteFile();

		const remote = getRemote();
		if (!remote) {
			new Notice("Pebble: electron remote is not available.");
			this.opening = false;
			return;
		}

		const settings = this.readSettings();
		try {
			const initialContent = noteFile ? await this.app.vault.read(noteFile) : "";
			this.session.load(noteFile, initialContent);
			const basename = noteFile?.basename ?? "选择笔记";
			const win = new remote.BrowserWindow({
				width: settings.windowWidth,
				height: settings.windowHeight,
				title: `${basename} — Pebble`,
				frame: currentPlatform() === "darwin" ? false : undefined,
				skipTaskbar: true,
				show: false,
				// A non-activating macOS panel accepts typing without raising
				// the other Obsidian windows when opened from another app.
				type: currentPlatform() === "darwin" ? "panel" : undefined,
				acceptFirstMouse: currentPlatform() === "darwin" ? true : undefined,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true,
				},
			});

			win.on("closed", () => {
				this.win = null;
			});

			// Keep the panel open across app/Space switches. The tray icon
			// toggles it closed explicitly, saving pending content first.

			this.win = win;

			const html = buildEditorHTML(
				initialContent,
				basename,
				settings.showNoteTitle,
				settings.themeMode,
				this.snapshot(),
			);
			const editorDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(
				html,
			)}`;
			await win.loadURL(editorDataUrl);

			if (settings.windowPositions[currentPlatform()]) {
				const { x, y } = settings.windowPositions[currentPlatform()]!;
				win.setPosition(x, y, false);
			} else {
				this.positionNearTray(win, remote, anchorBounds, settings);
			}
			this.listenForEditorChanges();
			win.show();
			// Explicit focus activates the owning app on macOS, defeating
			// the panel's non-activating behavior. show() makes it key already.
			if (currentPlatform() !== "darwin") win.focus();
		} catch (err) {
			if (this.win && !this.win.isDestroyed()) this.win.destroy();
			this.win = null;
			const errorMessage =
				err instanceof Error ? err.message : String(err);
			new Notice(`Pebble: failed to open window — ${errorMessage}`);
			console.error("Pebble: failed to open window", err);
		} finally {
			this.opening = false;
		}
	}

	private positionNearTray(
		win: ElectronBrowserWindowInstance,
		remote: NonNullable<ReturnType<typeof getRemote>>,
		anchorBounds: ElectronRectangle | undefined,
		settings: PebbleSettings,
	): void {
		if (!remote.screen) return;

		const [winWidth, winHeight] = win.getSize();
		const screen = remote.screen;

		const workArea = anchorBounds
			? (() => {
					const cx =
						anchorBounds.x + Math.round(anchorBounds.width / 2);
					const cy =
						anchorBounds.y + Math.round(anchorBounds.height / 2);
					return (
						screen.getDisplayNearestPoint({ x: cx, y: cy }) ??
						screen.getPrimaryDisplay()
					).workArea;
				})()
			: screen.getPrimaryDisplay().workArea;

		const { x, y } = calculateWindowPosition({
			anchor: anchorBounds,
			workArea,
			winSize: { width: winWidth, height: winHeight },
			offsets: { x: settings.trayOffsetX, y: settings.trayOffsetY },
		});
		win.setPosition(x, y, false);
	}

	private resolveNoteFile(): TFile | null {
		const path = normalizePath(this.readSettings().notePath.trim());
		const selected = this.app.vault.getAbstractFileByPath(path);
		if (selected instanceof TFile && selected.extension === "md") return selected;
		const active = this.app.workspace.getActiveFile();
		return active?.extension === "md" ? active : this.app.vault.getMarkdownFiles()[0] ?? null;
	}

	private snapshot(): PanelSnapshot {
		return {
			path: this.session.file?.path ?? "",
			title: this.session.file?.basename ?? "选择笔记",
			content: this.session.content,
			files: this.app.vault.getMarkdownFiles().map((file) => file.path).sort(),
			folders: this.app.vault.getAllLoadedFiles().filter((file) => file instanceof TFolder).map((file) => file.path).sort(),
			newNoteFolder: this.notes.newNoteFolder(this.session.file?.path ?? "").path,
			dailyNotesAvailable: this.notes.dailyAvailable(),
		};
	}

	private listenForEditorChanges(): void {
		this.win?.webContents.on("console-message", (...args: unknown[]) => {
			// Electron supports both the legacy positional and newer details event.
			const details = args[1] as { message?: unknown } | undefined;
			const message = typeof args[2] === "string" ? args[2] : details?.message;
			if (typeof message !== "string" || this.closePromise) return;
			try {
				if (message.startsWith("__pebble_save:")) {
					const data = JSON.parse(message.slice("__pebble_save:".length)) as { path: string; content: string };
					if (data.path === this.session.file?.path && typeof data.content === "string" && !this.switching) {
						this.session.queue(data.content);
						void this.session.flush().catch((error: unknown) => this.respond({ error: `保存失败：${String(error)}` }));
					}
				} else if (message.startsWith("__pebble_action:")) {
					const request = JSON.parse(message.slice("__pebble_action:".length)) as PanelRequest;
					this.actions = this.actions.then(() => this.handleAction(request)).catch((error: unknown) => this.respond({ id: request.id, error: String(error) }));
				}
			} catch { /* Ignore malformed renderer messages. */ }
		});
	}

	private async handleAction(request: PanelRequest): Promise<void> {
		if (!Number.isSafeInteger(request.id) || typeof request.content !== "string" || request.path !== (this.session.file?.path ?? "")) {
			await this.respond({ id: request.id, error: "笔记已变化，请重新操作。" });
			return;
		}
		const changingNote = ["select", "create", "daily"].includes(request.action);
		this.switching = changingNote;
		try {
			if (request.action === "copy") {
				const clipboard = getRemote()?.clipboard;
				if (!clipboard) throw new Error("系统剪贴板不可用。");
				clipboard.writeText(request.content);
				await this.respond({ id: request.id, message: "已复制全部 Markdown" });
				return;
			}
			this.session.queue(request.content);
			await this.session.flush();
			let file: TFile | null = null;
			switch (request.action) {
				case "select": {
					const target = this.app.vault.getAbstractFileByPath(normalizePath(request.target ?? ""));
					if (!(target instanceof TFile) || target.extension !== "md") throw new Error("该笔记已不存在。");
					file = target;
					break;
				}
				case "create": file = await this.notes.createNote(request.path, request.name ?? ""); break;
				case "daily": file = await this.notes.today(); break;
				case "list": break;
				default: throw new Error("未知操作。");
			}
			if (file) {
				const content = await this.app.vault.read(file);
				this.session.load(file, content);
				this.readSettings().notePath = file.path;
				try { await this.saveSettings(); } catch { /* The selected note remains usable for this session. */ }
			}
			await this.respond({ id: request.id, snapshot: this.snapshot(), changeNote: !!file });
		} catch (error) {
			await this.respond({ id: request.id, error: error instanceof Error ? error.message : String(error) });
		} finally {
			this.switching = false;
		}
	}

	private async respond(response: PanelResponse): Promise<void> {
		if (!this.win || this.win.isDestroyed()) return;
		try {
			await this.win.webContents.executeJavaScript(`window.__pebblePanel?.apply(${JSON.stringify(response)});`);
		} catch { /* The panel may have been closed. */ }
	}

	private async reloadEditorFromVault(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		// A vault read may complete after the user starts typing or switches notes.
		if (file !== this.session.file || this.session.dirty || this.session.isSaving || this.switching) return;
		if (content === this.session.content) return;
		this.session.load(file, content);
		await this.win?.webContents.executeJavaScript(`window.__pebbleEditor?.setContent(${JSON.stringify(content)});`);
	}
}
