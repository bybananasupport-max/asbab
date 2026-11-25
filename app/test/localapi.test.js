import { describe, it, expect, beforeEach } from "vitest";
import Store from "../www/store.js";
import LocalApi from "../www/localapi.js";

let api, store;
const clock = () => new Date("2026-11-25T04:00:00Z"); // 12:00 in Malaysia

beforeEach(() => {
  store = Store.createStore(Store.memoryBackend());
  api = LocalApi.createLocalApi({ store, version: "0.1.3", clock });
});

describe("bootstrap", () => {
  it("creates the pinned main room Asbab and default settings", async () => {
    const b = await api("bootstrap");
    expect(b.version).toBe("0.1.3");
    expect(b.rooms[0]).toMatchObject({ id: "utama", name: "Asbab", pinned: true });
    expect(b.settings.zone).toBe("KDH01");
    expect(b.settings.bilalLead).toBe(20);
    expect(b.ai).toBe(false);
  });

  it("writes a development log entry when the version changes", async () => {
    await api("bootstrap");
    await api("bootstrap");
    let { devlog } = await api("notes");
    expect(devlog).toHaveLength(1);
    api = LocalApi.createLocalApi({ store, version: "0.1.4", clock });
    await api("bootstrap");
    ({ devlog } = await api("notes"));
    expect(devlog[0].text).toContain("0.1.4");
  });
});

describe("rooms and chat", () => {
  it("keeps rooms until deleted, and protects the main room", async () => {
    const { room } = await api("rooms", { method: "POST", body: { name: "Kelas" } });
    await api("chat", { method: "POST", body: { roomId: room.id, text: "hai" } });
    expect((await api(`rooms/${room.id}`)).messages).toHaveLength(2);
    await expect(api("rooms/utama", { method: "DELETE" })).rejects.toThrow("tak boleh dipadam");
    await api(`rooms/${room.id}`, { method: "DELETE" });
    const b = await api("bootstrap");
    expect(b.rooms.map((r) => r.id)).toEqual(["utama"]);
  });

  it("labels phase 1 replies as own brain (no AI)", async () => {
    const d = await api("chat", { method: "POST", body: { roomId: "utama", text: "waktu solat" } });
    expect(d.user.text).toBe("waktu solat");
    expect(d.messages[0]).toMatchObject({ role: "asbab", ai: false });
  });

  it("rejects empty messages and unknown rooms", async () => {
    await expect(api("chat", { method: "POST", body: { text: "  " } })).rejects.toThrow("Mesej kosong");
    await expect(api("chat", { method: "POST", body: { roomId: "tiada", text: "x" } })).rejects.toThrow("Bilik tak wujud");
  });
});

describe("notes and today", () => {
  it("stores notes and shows today's schedule and spending", async () => {
    await api("notes", { method: "POST", body: { kind: "jadual", title: "Kelas", date: "2026-11-25", time: "14:00" } });
    await api("notes", { method: "POST", body: { kind: "jadual", title: "Subuh berjemaah", date: "2026-11-25", time: "06:00" } });
    await api("notes", { method: "POST", body: { kind: "belanja", title: "Nasi lemak", amount: "5.5" } });
    await api("notes", { method: "POST", body: { kind: "belanja", title: "Teh", amount: 2 } });
    const t = await api("today");
    expect(t.now.date).toBe("2026-11-25");
    expect(t.jadual.map((n) => n.title)).toEqual(["Subuh berjemaah", "Kelas"]);
    expect(t.belanjaTotal).toBeCloseTo(7.5);
    expect(t.prayer).toBeNull();
  });

  it("ignores notes without a title and unknown kinds become nota", async () => {
    const r = await api("notes", { method: "POST", body: { kind: "rahsia", title: "x" } });
    expect(r.added[0].kind).toBe("nota");
    expect((await api("notes", { method: "POST", body: { kind: "nota" } })).added).toHaveLength(0);
  });

  it("marks and unmarks a prayer", async () => {
    let r = await api("solat", { method: "POST", body: { waktu: "asr", done: true } });
    expect(r.solat.asr).toBeTypeOf("number");
    r = await api("solat", { method: "POST", body: { waktu: "asr", done: false } });
    expect(r.solat.asr).toBeUndefined();
  });
});

describe("settings", () => {
  it("merges access toggles instead of replacing them", async () => {
    await api("settings", { method: "PUT", body: { access: { whatsapp: true } } });
    const { settings } = await api("settings", { method: "PUT", body: { name: "Amin", access: { email: true } } });
    expect(settings.access).toMatchObject({ whatsapp: true, email: true, skrin: false });
  });
});

describe("projects", () => {
  it("creates a project with its own chat room and deletes both", async () => {
    const { project } = await api("projects", { method: "POST", body: { name: "Milogamingstore", type: "kod" } });
    expect(project.type).toBe("kod");
    expect((await api("bootstrap")).rooms.find((r) => r.id === `p-${project.id}`)).toBeTruthy();
    await api(`projects/${project.id}`, { method: "PATCH", body: { archived: true } });
    expect((await api("projects")).projects[0].archived).toBe(true);
    await api(`projects/${project.id}`, { method: "DELETE" });
    expect((await api("projects")).projects).toHaveLength(0);
    expect((await api("bootstrap")).rooms.find((r) => r.id === `p-${project.id}`)).toBeUndefined();
  });

  it("does not pretend GitHub works yet", async () => {
    const { project } = await api("projects", { method: "POST", body: { name: "X" } });
    await expect(api(`projects/${project.id}/files`)).rejects.toThrow("Fasa 5");
  });
});

describe("export and import", () => {
  it("round-trips data into a fresh phone", async () => {
    await api("notes", { method: "POST", body: { kind: "idea", title: "AI ROOM" } });
    const backup = await api("export");
    expect(backup.asbab).toBe("identiti");

    const fresh = LocalApi.createLocalApi({ store: Store.createStore(Store.memoryBackend()), version: "0.1.3", clock });
    await fresh("import", { method: "POST", body: backup });
    const { notes } = await fresh("notes");
    expect(notes.map((n) => n.title)).toContain("AI ROOM");
  });

  it("refuses files that are not an Asbab backup", async () => {
    await expect(api("import", { method: "POST", body: { hello: 1 } })).rejects.toThrow("bukan backup");
  });
});
