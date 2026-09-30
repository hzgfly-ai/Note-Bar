/** Serializes writes and drains the latest edit before changing files. */
export class NoteSession<File> {
	file: File | null = null;
	content = "";
	private pending: string | null = null;
	private saving: Promise<void> | null = null;

	constructor(private write: (file: File, content: string) => Promise<void>) {}

	load(file: File | null, content: string): void {
		this.file = file;
		this.content = content;
		this.pending = null;
	}

	queue(content: string): void {
		this.pending = content;
	}

	get dirty(): boolean { return this.pending !== null && this.pending !== this.content; }
	get isSaving(): boolean { return this.saving !== null; }

	async flush(): Promise<void> {
		if (this.saving) {
			await this.saving;
			return this.flush();
		}
		if (!this.file || !this.dirty) return;
		const file = this.file;
		const content = this.pending!;
		this.saving = this.write(file, content);
		try {
			await this.saving;
			this.content = content;
		} finally {
			this.saving = null;
		}
		if (this.dirty) await this.flush();
	}
}
