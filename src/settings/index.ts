import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	normalizePath,
} from "obsidian";

export type PebbleThemeMode = "auto" | "light" | "dark";

export interface WindowPosition {
	x: number;
	y: number;
}

export interface PebbleSettings {
	notePath: string;
	monochromeTrayIcon: boolean;
	showNoteTitle: boolean;
	themeMode: PebbleThemeMode;
	glassEffect: boolean;
	/** Saved window position per OS platform — a position saved on one device
	 * (e.g. Windows) shouldn't be reused on another (e.g. macOS) when settings
	 * are synced across devices. */
	windowPositions: Partial<Record<NodeJS.Platform, WindowPosition>>;
	windowWidth: number;
	windowHeight: number;
	/** Extra offset applied on first open (before any saved position) */
	trayOffsetX: number;
	trayOffsetY: number;
}

export const DEFAULT_SETTINGS: PebbleSettings = {
	notePath: "",
	monochromeTrayIcon: false,
	showNoteTitle: true,
	themeMode: "auto",
	glassEffect: true,
	windowPositions: {},
	windowWidth: 420,
	windowHeight: 320,
	trayOffsetX: 0,
	trayOffsetY: 0,
};

type SettingsTabPluginHost = Plugin & {
	settings: PebbleSettings;
	saveSettings(): Promise<void>;
	refreshTrayIcon(): void;
};

export class PebbleSettingTab extends PluginSettingTab {
	private plugin: SettingsTabPluginHost;

	constructor(app: App, plugin: SettingsTabPluginHost) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Note")
			.setDesc("Choose the note that pebble opens and saves as you type.")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Select a note");
				const notes = this.plugin.app.vault
					.getMarkdownFiles()
					.sort((a, b) => a.path.localeCompare(b.path));
				for (const note of notes) {
					dropdown.addOption(note.path, note.path);
				}
				dropdown
					.setValue(this.plugin.settings.notePath)
					.onChange(async (value) => {
						this.plugin.settings.notePath = normalizePath(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Monochrome tray icon")
			.setDesc(
				"Use a monochrome tray icon that blends with the system tray or menu bar.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.monochromeTrayIcon)
					.onChange(async (value) => {
						this.plugin.settings.monochromeTrayIcon = value;
						await this.plugin.saveSettings();
						this.plugin.refreshTrayIcon();
					});
			});

		new Setting(containerEl)
			.setName("Show note title")
			.setDesc(
				"Show the current note title as a subtle watermark in the editor.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showNoteTitle)
					.onChange(async (value) => {
						this.plugin.settings.showNoteTitle = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("面板主题")
			.setDesc("跟随 Obsidian 当前主题，或固定使用浅色／深色。打开的面板会立即更新。")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("auto", "跟随 Obsidian")
					.addOption("light", "浅色")
					.addOption("dark", "深色")
					.setValue(this.plugin.settings.themeMode)
					.onChange(async (value) => {
						if (value !== "auto" && value !== "light" && value !== "dark") return;
						this.plugin.settings.themeMode = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("磨砂玻璃效果")
			.setDesc("macOS 使用系统背景模糊与半透明面板；关闭后恢复纯色。其他系统使用纯色。")
			.addToggle((toggle) => toggle.setValue(this.plugin.settings.glassEffect).onChange(async (value) => {
				this.plugin.settings.glassEffect = value; await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName("Horizontal tray offset")
			.setDesc(
				"Horizontal offset in pixels applied when the window first opens near the tray icon. Positive moves right, negative moves left.",
			)
			.addText((text) => {
				text.setPlaceholder("0")
					.setValue(String(this.plugin.settings.trayOffsetX))
					.onChange(async (value) => {
						const parsed = Number(value);
						this.plugin.settings.trayOffsetX = Number.isFinite(
							parsed,
						)
							? parsed
							: 0;
						// Otherwise the saved position masks the new offset
						delete this.plugin.settings.windowPositions[
							process.platform
						];
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Vertical tray offset")
			.setDesc(
				"Vertical offset in pixels applied when the window first opens near the tray icon. Positive moves down, negative moves up.",
			)
			.addText((text) => {
				text.setPlaceholder("0")
					.setValue(String(this.plugin.settings.trayOffsetY))
					.onChange(async (value) => {
						const parsed = Number(value);
						this.plugin.settings.trayOffsetY = Number.isFinite(
							parsed,
						)
							? parsed
							: 0;
						// Otherwise the saved position masks the new offset
						delete this.plugin.settings.windowPositions[
							process.platform
						];
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Reset window position")
			.setDesc(
				"Clear the saved window position for this device so it recalculates near the tray icon on next open.",
			)
			.addButton((button) => {
				button.setButtonText("Reset").onClick(async () => {
					delete this.plugin.settings.windowPositions[
						process.platform
					];
					await this.plugin.saveSettings();
				});
			});
	}
}
