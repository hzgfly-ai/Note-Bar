import { describe, expect, it } from "vitest";
import { NoteSession } from "./note-session";
describe("note writes", () => {
	it("drains edits that arrive while the previous save is in flight before switching", async () => {
		const writes: string[] = [];
		let finish = () => {};
		const session = new NoteSession<string>(async (file, content) => {
			writes.push(file + ":" + content);
			if (content === "first") await new Promise<void>((resolve) => { finish = resolve; });
		});
		session.load("A", "original"); session.queue("first");
		const saving = session.flush();
		session.queue("latest"); const switching = session.flush();
		finish(); await Promise.all([saving, switching]);
		session.load("B", "new note"); session.queue("B edit"); await session.flush();
		expect(writes).toEqual(["A:first", "A:latest", "B:B edit"]);
	});
	it("retains unsaved content after a failure so switching cannot silently lose it", async () => {
		let fail = true;
		const session = new NoteSession<string>(async () => { if (fail) throw new Error("disk full"); });
		session.load("A", "old"); session.queue("new");
		await expect(session.flush()).rejects.toThrow("disk full");
		expect(session.dirty).toBe(true); expect(session.content).toBe("old");
		fail = false; await session.flush(); expect(session.content).toBe("new");
	});
});
