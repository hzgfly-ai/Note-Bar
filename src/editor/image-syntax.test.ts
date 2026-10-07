import { describe, expect, it } from "vitest";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { imageEmbeds, resizeEmbed } from "./image-syntax";
const parse = (doc: string) => imageEmbeds(doc, markdownLanguage.parser.parse(doc));
describe("image Markdown", () => {
	it("finds wiki and Markdown images, including Chinese paths, spaces and escaped parentheses", () => {
		const images = parse('![[附件/截图.png|240]]\n![说明|180](<附件/长 图.png> "保留标题")\n![图](a\\(b\\).png)');
		expect(images.map((image) => [image.target, image.width])).toEqual([["附件/截图.png", 240], ["附件/长 图.png", 180], ["a(b).png", undefined]]);
	});
	it("does not preview examples in inline code, fences, indented code or escaped Markdown", () => {
		expect(parse('`![[a.png]]`\n\n```md\n![[b.png]]\n![b](b.png)\n```\n\n    ![[c.png]]\n\n\\![[d.png]]')).toEqual([]);
	});
	it("changes only the width and preserves the Markdown destination and title", () => {
		const image = parse('![说明|180](<附件/长 图.png> "标题")')[0]!;
		expect(resizeEmbed(image, 240)).toBe('![说明|240](<附件/长 图.png> "标题")');
		expect(resizeEmbed(image)).toBe('![说明](<附件/长 图.png> "标题")');
	});
	it("replaces width and height with proportional width and clamps unsafe sizes", () => {
		const image = parse("![[图.png|200x100]]")[0]!;
		expect(resizeEmbed(image, 100)).toBe("![[图.png|100]]");
		expect(resizeEmbed(image)).toBe("![[图.png]]");
		expect(resizeEmbed(image, 1)).toBe("![[图.png|32]]");
	});
	it("keeps note/PDF embeds as text instead of treating them as broken images", () => {
		expect(parse("![[另一篇笔记]]\n![[说明.pdf]]\n![pdf](说明.pdf)")).toEqual([]);
	});
});
