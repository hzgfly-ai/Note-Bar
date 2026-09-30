import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, PebbleSettings, PebbleSettingTab } from "./settings";
import { NativeWindow } from "./window/native-window";
import { PebbleTray } from "./tray";

export default class PebblePlugin extends Plugin {
	settings: PebbleSettings = { ...DEFAULT_SETTINGS };
	private overlayWindow: NativeWindow | null = null;
	private tray: PebbleTray | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.overlayWindow = new NativeWindow(
			this.app,
			() => this.settings,
			() => this.saveSettings(),
		);

		this.registerDomEvent(window, "beforeunload", () => {
			void this.overlayWindow?.close();
			this.tray?.destroy();
		});

		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.overlayWindow?.handleNotePathRenamed(file, oldPath)));
		this.registerEvent(this.app.vault.on("create", () => this.overlayWindow?.refreshCatalog()));
		this.registerEvent(this.app.vault.on("delete", () => this.overlayWindow?.refreshCatalog()));

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				this.overlayWindow?.onVaultModify(file);
			}),
		);

		this.createTray();

		this.addSettingTab(new PebbleSettingTab(this.app, this));
	}

	onunload(): void {
		void this.overlayWindow?.close();
		this.overlayWindow = null;

		this.tray?.destroy();
		this.tray = null;
	}

	refreshTrayIcon(): void {
		this.tray?.destroy();
		this.createTray();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async loadSettings(): Promise<void> {
		const storedSettings =
			(await this.loadData()) as Partial<PebbleSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings);
	}

	private createTray(): void {
		this.tray = new PebbleTray();
		this.tray.create((bounds) => {
			void this.overlayWindow?.toggle(bounds);
		}, this.settings.monochromeTrayIcon);
	}
}
