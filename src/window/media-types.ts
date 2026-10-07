export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const MEDIA_CHUNK_SIZE = 48 * 1024;

export interface MediaRequest {
	id: number;
	action: "resolve" | "paste";
	path: string;
	target?: string;
	name?: string;
	mime?: string;
	chunks?: number;
}

export interface MediaChunk { id: number; index: number; data: string }
export interface MediaResponse {
	id: number;
	path: string;
	url?: string;
	markdown?: string;
	error?: string;
}

/** Bound uploads and require contiguous chunks; incomplete transfers never create files. */
export class MediaTransfers {
	private uploads = new Map<number, { data: string[]; length: number; started: number }>();
	add(chunk: MediaChunk): void {
		for (const [id, upload] of this.uploads) if (Date.now() - upload.started > 60_000) this.uploads.delete(id);
		if (!Number.isSafeInteger(chunk.id) || !Number.isSafeInteger(chunk.index) || typeof chunk.data !== "string" || chunk.data.length > MEDIA_CHUNK_SIZE) return;
		if (chunk.index === 0 && this.uploads.size < 4) this.uploads.set(chunk.id, { data: [], length: 0, started: Date.now() });
		const upload = this.uploads.get(chunk.id);
		if (!upload || chunk.index !== upload.data.length || upload.length + chunk.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
			this.uploads.delete(chunk.id); return;
		}
		upload.data.push(chunk.data); upload.length += chunk.data.length;
	}
	take(id: number, chunks?: number): string {
		const upload = this.uploads.get(id); this.uploads.delete(id);
		if (!upload || upload.data.length !== chunks) throw new Error("图片传输不完整，请重新粘贴。");
		return upload.data.join("");
	}
	clear(): void { this.uploads.clear(); }
}
