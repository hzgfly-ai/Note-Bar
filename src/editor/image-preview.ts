import { StateEffect, StateField, EditorState } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { imageEmbeds, ImageEmbed, resizeEmbed } from "./image-syntax";
import type { MediaBridge } from "./media-bridge";

export const refreshImages = StateEffect.define<null>();
interface ImageContext { media: MediaBridge; getPath(): string; status(message: string, error?: boolean): void }

class ImageWidget extends WidgetType {
	constructor(private image: ImageEmbed, private path: string, private context: ImageContext, private revision: number, private inline: boolean) { super(); }
	eq(other: ImageWidget): boolean { return this.path === other.path && this.image.raw === other.image.raw && this.image.from === other.image.from && this.revision === other.revision && this.inline === other.inline; }
	toDOM(view: EditorView): HTMLElement {
		const { image, path, context } = this;
		const root = document.createElement(this.inline ? "span" : "div"); root.className = this.inline ? "pebble-image-preview is-inline" : "pebble-image-preview"; root.contentEditable = "false";
		const frame = document.createElement("span"); frame.className = "pebble-image-frame";
		const img = document.createElement("img"); img.alt = image.alt || image.target; img.draggable = false; img.referrerPolicy = "no-referrer"; img.hidden = true;
		if (image.width) frame.style.width = `${image.width}px`;
		const message = document.createElement("span"); message.className = "pebble-image-message"; message.textContent = "正在加载图片…";
		const commit = (width?: number): void => {
			if (view.state.readOnly || context.getPath() !== path || view.state.doc.sliceString(image.from, image.to) !== image.raw) return;
			const insert = resizeEmbed(image, width);
			view.dispatch({ changes: { from: image.from, to: image.to, insert }, userEvent: "input.image.resize", annotations: isolateHistory.of("full") });
			context.status("");
		};
		const handle = document.createElement("button"); handle.type = "button"; handle.className = "pebble-image-resize"; handle.title = "拖动调整图片宽度"; handle.setAttribute("aria-label", "拖动缩放图片，方向键微调");
		const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		icon.setAttribute("viewBox", "0 0 16 16"); icon.setAttribute("aria-hidden", "true");
		const corner = document.createElementNS("http://www.w3.org/2000/svg", "path");
		corner.setAttribute("d", "M 4 12 H 10 A 2 2 0 0 0 12 10 V 4");
		icon.append(corner); handle.append(icon);
		handle.addEventListener("keydown", (event) => {
			if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); commit((image.width || img.getBoundingClientRect().width) + (event.key === "ArrowLeft" ? -10 : 10)); }
		});
		let cleanupDrag: (() => void) | undefined;
		handle.addEventListener("pointerdown", (event) => {
			if (event.button !== 0 || view.state.readOnly) return;
			event.preventDefault(); const start = event.clientX; const initial = img.getBoundingClientRect().width; let next = initial;
			handle.setPointerCapture(event.pointerId); root.classList.add("is-resizing");
			const move = (move: PointerEvent): void => { next = Math.round(Math.max(32, Math.min(view.contentDOM.clientWidth - 36, initial + move.clientX - start))); frame.style.width = `${next}px`; view.requestMeasure(); };
			const finish = (): void => { cleanupDrag?.(); if (next !== initial) commit(next); };
			cleanupDrag = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", finish); handle.removeEventListener("pointercancel", cancel); root.classList.remove("is-resizing"); cleanupDrag = undefined; };
			const cancel = (): void => { cleanupDrag?.(); frame.style.width = image.width ? `${image.width}px` : ""; view.requestMeasure(); };
			handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", cancel);
		});
		img.addEventListener("load", () => { img.hidden = false; message.hidden = true; handle.hidden = false; view.requestMeasure(); });
		img.addEventListener("error", () => { img.hidden = true; handle.hidden = true; message.hidden = false; message.textContent = "图片无法显示，原始链接已保留"; view.requestMeasure(); });
		handle.hidden = true;
		frame.append(img, message, handle); root.append(frame);
		const load = async (): Promise<void> => {
			try {
				const url = await context.media.resolve(path, image.target);
				if (context.getPath() === path && root.isConnected) img.src = url;
			} catch (error) { message.textContent = String(error instanceof Error ? error.message : error); view.requestMeasure(); }
		};
		// CM is still updating while constructing widgets; defer bridge requests.
		if (/^https?:\/\//i.test(image.target)) {
			message.textContent = "网络图片";
			const loadRemote = document.createElement("button"); loadRemote.type = "button"; loadRemote.textContent = "加载网络图片";
			loadRemote.addEventListener("click", () => { img.src = image.target; loadRemote.remove(); }); frame.append(loadRemote);
		} else queueMicrotask(() => { void load(); });
		return root;
	}
	coordsAt(dom: HTMLElement, pos: number): { left: number; right: number; top: number; bottom: number } {
		const bounds = dom.getBoundingClientRect();
		const content = dom.closest(".cm-content") ?? dom;
		const height = Math.min(bounds.height, parseFloat(getComputedStyle(content).lineHeight) || 20);
		const top = pos > 0 ? bounds.bottom - height : bounds.top;
		// The hidden embed is atomic. Its boundary caret should be one text
		// line tall, rather than spanning the full rendered image height.
		return { left: bounds.left, right: bounds.left, top, bottom: top + height };
	}
	ignoreEvent(): boolean { return true; }
}

export function imagePreview(context: ImageContext) {
	let revision = 0;
	const decorate = (state: EditorState): DecorationSet => {
		const doc = state.doc.toString();
		return Decoration.set(imageEmbeds(doc, syntaxTree(state)).map((image) => {
			const line = state.doc.lineAt(image.from);
			const standalone = !doc.slice(line.from, image.from).trim() && !doc.slice(image.to, line.to).trim();
			// Replace only the display of the embed; saved/copied Markdown stays
			// intact. Inline images retain the surrounding text and list markers.
			return Decoration.replace({
				widget: new ImageWidget(image, context.getPath(), context, revision, !standalone),
				block: standalone,
			}).range(standalone ? line.from : image.from, standalone ? line.to : image.to);
		}), true);
	};
	return StateField.define<DecorationSet>({
		create: decorate,
		update(decorations, transaction) {
			if (transaction.effects.some((effect) => effect.is(refreshImages))) revision++;
			if (transaction.docChanged || syntaxTree(transaction.startState) !== syntaxTree(transaction.state) || transaction.effects.some((effect) => effect.is(refreshImages))) return decorate(transaction.state);
			return decorations;
		},
		provide: (field) => [
			EditorView.decorations.from(field),
			// Cursor movement/deletion must treat the hidden syntax as one image.
			EditorView.atomicRanges.of((view) => view.state.field(field)),
		],
	});
}
