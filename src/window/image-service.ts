import { App, TFile } from "obsidian";
import { MAX_IMAGE_BYTES } from "./media-types";

const MIME_EXT: Record<string, string> = {
	"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
	"image/bmp": "bmp", "image/avif": "avif", "image/svg+xml": "svg",
};
const EXT_MIME: Record<string, string> = {};
for (const [mime, ext] of Object.entries(MIME_EXT)) EXT_MIME[ext] = mime;
EXT_MIME.jpeg = "image/jpeg";

export class ImageService {
	constructor(private app: App) {}
	async paste(sourcePath: string, name: string, mime: string, base64: string): Promise<string> {
		if (!(this.app.vault.getAbstractFileByPath(sourcePath) instanceof TFile)) throw new Error("请先选择笔记。");
		const ext = MIME_EXT[mime];
		if (!ext || !base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("不支持此图片格式。");
		const bytes = Buffer.from(base64, "base64");
		if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("单张图片不能超过 32 MB。");
		// Always use the panel's note as the source, never the main window's active note.
		let stem = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|#[\]]/g, "-").trim().slice(0, 150);
		if (!stem || stem === "image") stem = `粘贴图片-${new Date().toISOString().replace(/[:.]/g, "-")}`;
		const path = await this.app.fileManager.getAvailablePathForAttachment(`${stem}.${ext}`, sourcePath);
		const file = await this.app.vault.createBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
		const link = this.app.fileManager.generateMarkdownLink(file, sourcePath);
		return link.startsWith("!") ? link : "!" + link;
	}
	async resolve(sourcePath: string, target: string): Promise<string> {
		// Only vault files may be read. No absolute paths, file:// URLs or network fetches.
		if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) throw new Error("仅支持仓库内图片。");
		let decoded = target;
		try { decoded = decodeURIComponent(target); } catch { /* A literal % is a valid vault filename. */ }
		const file = this.app.metadataCache.getFirstLinkpathDest(decoded.split("#")[0]!, sourcePath);
		if (!(file instanceof TFile) || !EXT_MIME[file.extension.toLowerCase()]) throw new Error("找不到仓库中的图片。");
		if (file.stat.size > MAX_IMAGE_BYTES) throw new Error("图片超过 32 MB，请在 Obsidian 中查看。");
		const data = await this.app.vault.readBinary(file);
		if (data.byteLength > MAX_IMAGE_BYTES) throw new Error("图片超过 32 MB。");
		return `data:${EXT_MIME[file.extension.toLowerCase()]};base64,${Buffer.from(data).toString("base64")}`;
	}
}
