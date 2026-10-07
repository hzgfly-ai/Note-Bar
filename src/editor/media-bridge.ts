import { MAX_IMAGE_BYTES, MEDIA_CHUNK_SIZE } from "../window/media-types";
import type { MediaRequest, MediaResponse } from "../window/media-types";

declare global { interface Window { __pebbleMedia?: { apply(response: MediaResponse): void } } }

export class MediaBridge {
	private counter = 0;
	private pending = new Map<number, { path: string; resolve: (response: MediaResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
	private cache = new Map<string, Promise<string>>();
	constructor() {
		window.__pebbleMedia = { apply: (response) => {
			const pending = this.pending.get(response.id);
			if (!pending) return;
			this.pending.delete(response.id); clearTimeout(pending.timer);
			if (response.path !== pending.path) pending.reject(new Error("笔记已变化。"));
			else if (response.error) pending.reject(new Error(response.error));
			else pending.resolve(response);
		} };
	}
	private request(request: Omit<MediaRequest, "id">, base64?: string): Promise<MediaResponse> {
		const id = ++this.counter;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("图片操作超时，请重试。")); }, 60_000);
			this.pending.set(id, { path: request.path, resolve, reject, timer });
			if (base64) {
				request.chunks = Math.ceil(base64.length / MEDIA_CHUNK_SIZE);
				for (let index = 0; index < request.chunks; index++) console.debug("__pebble_media_chunk:" + JSON.stringify({ id, index, data: base64.slice(index * MEDIA_CHUNK_SIZE, (index + 1) * MEDIA_CHUNK_SIZE) }));
			}
			console.debug("__pebble_media:" + JSON.stringify({ ...request, id }));
		});
	}
	resolve(path: string, target: string): Promise<string> {
		const key = path + "\0" + target;
		if (!this.cache.has(key)) this.cache.set(key, this.request({ action: "resolve", path, target }).then((response) => {
			if (!response.url) throw new Error("图片不可用。"); return response.url;
		}));
		return this.cache.get(key)!;
	}
	async paste(path: string, file: File): Promise<string> {
		if (file.size > MAX_IMAGE_BYTES) throw new Error("单张图片不能超过 32 MB。");
		const data = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader(); reader.onload = () => {
				if (typeof reader.result === "string") resolve(reader.result.split(",")[1]!);
				else reject(new Error("无法读取粘贴的图片。"));
			};
			reader.onerror = () => reject(new Error("无法读取粘贴的图片。")); reader.readAsDataURL(file);
		});
		const response = await this.request({ action: "paste", path, name: file.name, mime: file.type }, data);
		if (!response.markdown) throw new Error("图片未保存。"); return response.markdown;
	}
	clear(): void { this.cache.clear(); }
	destroy(): void {
		for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("面板已关闭。")); }
		this.pending.clear(); this.cache.clear(); delete window.__pebbleMedia;
	}
}
