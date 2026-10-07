import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
	class File { extension: string; stat = { size: 4 }; constructor(public path: string) { this.extension = path.split(".").pop()!; } }
	return { File };
});
vi.mock("obsidian", () => ({ App: class {}, TFile: mocks.File }));
import { ImageService } from "./image-service";
import { MAX_IMAGE_BYTES, MediaTransfers } from "./media-types";
import { resolveTheme } from "./appearance";
import type { App } from "obsidian";
function fixture(wiki = true) {
	const note = new mocks.File("笔记/当前.md"); const image = new mocks.File("笔记/附件/图 1.png");
	const app = {
		vault: { getAbstractFileByPath: () => note, createBinary: vi.fn(async () => image), readBinary: vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer) },
		fileManager: { getAvailablePathForAttachment: vi.fn(async (_name: string, _source: string) => image.path), generateMarkdownLink: vi.fn(() => wiki ? "[[附件/图 1.png]]" : "[图](附件/图%201.png)") },
		metadataCache: { getFirstLinkpathDest: vi.fn(() => image) },
	};
	return { app, image, service: new ImageService(app as unknown as App) };
}
describe("image attachments", () => {
	it("uses the panel note's attachment configuration, deduplicated path and original bytes", async () => {
		const f = fixture(); expect(await f.service.paste("笔记/当前.md", "图.png", "image/png", "AQIDBA==")).toBe("![[附件/图 1.png]]");
		expect(f.app.fileManager.getAvailablePathForAttachment).toHaveBeenCalledWith("图.png", "笔记/当前.md");
		expect(f.app.vault.createBinary).toHaveBeenCalledWith("笔记/附件/图 1.png", new Uint8Array([1, 2, 3, 4]).buffer);
		expect(f.app.fileManager.generateMarkdownLink).toHaveBeenCalledWith(f.image, "笔记/当前.md");
	});
	it("respects the user's preference for Markdown links", async () => {
		expect(await fixture(false).service.paste("笔记/当前.md", "图.png", "image/png", "AQIDBA==")).toBe("![图](附件/图%201.png)");
	});
	it("resolves percent-encoded relative links using Obsidian's metadata cache", async () => {
		const f = fixture(); expect(await f.service.resolve("笔记/当前.md", "附件/图%201.png")).toBe("data:image/png;base64,AQIDBA==");
		expect(f.app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("附件/图 1.png", "笔记/当前.md");
	});
	it("rejects non-vault URLs, unsupported files and oversized images", async () => {
		const f = fixture(); await expect(f.service.resolve("笔记/当前.md", "file:///private/a.png")).rejects.toThrow("仓库内");
		await expect(f.service.paste("笔记/当前.md", "a.txt", "text/plain", "AQIDBA==")).rejects.toThrow("格式");
		f.image.stat.size = MAX_IMAGE_BYTES + 1; await expect(f.service.resolve("笔记/当前.md", "图.png")).rejects.toThrow("32 MB");
		expect(f.app.vault.readBinary).not.toHaveBeenCalled();
	});
	it("sanitizes clipboard filenames instead of treating them as paths", async () => {
		const f = fixture(); await f.service.paste("笔记/当前.md", "../../秘密[1].png", "image/png", "AQIDBA==");
		const name = f.app.fileManager.getAvailablePathForAttachment.mock.calls[0]?.[0];
		expect(name).not.toContain("/"); expect(name).not.toContain("["); expect(name).not.toContain("]");
	});
});
describe("media transfer", () => {
	it("joins contiguous chunks and consumes each transfer exactly once", () => {
		const transfer = new MediaTransfers(); transfer.add({ id: 1, index: 0, data: "AQID" }); transfer.add({ id: 1, index: 1, data: "BA==" });
		expect(transfer.take(1, 2)).toBe("AQIDBA=="); expect(() => transfer.take(1, 2)).toThrow("不完整");
	});
	it("rejects dropped or out-of-order chunks without writing a partial file", () => {
		const transfer = new MediaTransfers(); transfer.add({ id: 1, index: 0, data: "AQID" }); transfer.add({ id: 1, index: 2, data: "BA==" });
		expect(() => transfer.take(1, 3)).toThrow("不完整");
	});
});
describe("panel theme", () => {
	it("follows the actual Obsidian theme and keeps explicit light/dark overrides", () => {
		expect(resolveTheme("auto", true)).toBe("dark"); expect(resolveTheme("auto", false)).toBe("light");
		expect(resolveTheme("light", true)).toBe("light"); expect(resolveTheme("dark", false)).toBe("dark");
	});
});
