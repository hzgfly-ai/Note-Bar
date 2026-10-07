/** Plain data shared with the isolated panel renderer. */
export interface PanelAppearance { theme: "light" | "dark"; glass: boolean }
export interface PanelSnapshot {
	path: string;
	title: string;
	content: string;
	files: string[];
	folders: string[];
	newNoteFolder: string;
	dailyNotesAvailable: boolean;
}

export interface PanelRequest {
	id: number;
	action: "list" | "select" | "create" | "daily" | "copy";
	path: string;
	content: string;
	target?: string;
	name?: string;
}

export interface PanelResponse {
	id?: number;
	snapshot?: PanelSnapshot;
	changeNote?: boolean;
	error?: string;
	message?: string;
	assetsChanged?: boolean;
}
