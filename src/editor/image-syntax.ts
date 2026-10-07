import type { SyntaxNode, Tree } from "@lezer/common";

export interface ImageEmbed { from: number; to: number; raw: string; target: string; alt: string; width?: number; labelEnd?: number; kind: "wiki" | "markdown" }
const codeNodes = new Set(["InlineCode", "FencedCode", "CodeBlock", "HTMLBlock", "Comment"]);
const isImageTarget = (target: string): boolean => /^https?:\/\//i.test(target) || /\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:#.*)?$/i.test(target);
function inCode(node: SyntaxNode): boolean {
	for (let current: SyntaxNode | null = node; current; current = current.parent) if (codeNodes.has(current.name)) return true;
	return false;
}
function labelSize(label: string): { alt: string; width?: number } {
	const match = /\|(\d+)(?:x\d+)?$/.exec(label);
	return match ? { alt: label.slice(0, match.index), width: Number(match[1]) } : { alt: label };
}

/** Use the Markdown parser to exclude code and find balanced/escaped destinations. */
export function imageEmbeds(doc: string, tree: Tree): ImageEmbed[] {
	const result: ImageEmbed[] = [];
	const wiki = /!\[\[([^\]\n]+)\]\]/g;
	let match: RegExpExecArray | null;
	while ((match = wiki.exec(doc))) {
		if (inCode(tree.resolveInner(match.index, 1)) || (/(\\+)$/.exec(doc.slice(0, match.index))?.[1]?.length ?? 0) % 2 === 1) continue;
		const parts = match[1]!.split("|");
		const target = parts.shift()!;
		if (!isImageTarget(target)) continue;
		const label = parts.join("|");
		const size = /^\d+(?:x\d+)?$/.test(label) ? { alt: "", width: parseInt(label, 10) } : labelSize(label);
		result.push({ from: match.index, to: wiki.lastIndex, raw: match[0], target, ...size, kind: "wiki" });
	}
	tree.iterate({ enter(node) {
		if (node.name !== "Image" || inCode(node.node) || result.some((image) => node.from >= image.from && node.from < image.to)) return;
		const url = node.node.getChild("URL");
		const label = node.node.getChildren("LinkMark")[1];
		if (!url || !label) return; // Reference images remain editable as Markdown.
		const target = doc.slice(url.from, url.to).replace(/^<|>$/g, "").replace(/\\([\\()[\] ])/g, "$1");
		if (!isImageTarget(target)) return;
		const text = doc.slice(node.from + 2, label.from);
		result.push({ from: node.from, to: node.to, raw: doc.slice(node.from, node.to), target, ...labelSize(text), labelEnd: label.from - node.from, kind: "markdown" });
	} });
	return result.sort((a, b) => a.from - b.from);
}

export function resizeEmbed(image: ImageEmbed, width?: number): string {
	const size = width === undefined ? "" : "|" + Math.max(32, Math.min(4096, Math.round(width)));
	if (image.kind === "wiki") return `![[${image.target}${image.alt ? "|" + image.alt : ""}${size}]]`;
	// Replace only the label; URL, escaped characters and optional title stay verbatim.
	const end = image.labelEnd!;
	return `![${image.alt}${size}` + image.raw.slice(end);
}
