import { describe, it, expect, beforeEach } from "vitest";
import Brain from "../www/brain.js";
import Core from "../www/core.js";

const settings = { ...Core.DEFAULT_SETTINGS };
const today = "2026-11-25";
let notes, rooms, projects, brain, prayerCalls;

beforeEach(() => {
  notes = []; rooms = []; projects = []; prayerCalls = [];
  brain = Brain.createBrain({
    now: () => ({ date: today }),
    notes: async () => notes,
    addNotes: async (items) => { for (const it of items) notes.push({ id: String(notes.length), date: today, text: "", ...it }); return items; },
    createRoom: async (name, extra = {}) => { const r = { id: extra.id || `r${rooms.length}`, name, ...extra }; rooms.push(r); return r; },
    projects: async () => projects,
    saveProjects: async (list) => { projects = list; },
    prayerTimes: async (zone, date) => {
      prayerCalls.push([zone, date]);
      return { fajr: "05:50", dhuhr: "13:10", asr: "16:30", maghrib: "19:05", isha: "20:15" };
    },
  });
});
const ask = (text) => brain(text, { settings });

describe("own brain intents (no AI)", () => {
  it("help", async () => {
    expect((await ask("tolong")).reply).toContain("tanpa guna AI");
    expect((await ask("Menu?")).reply).toContain("waktu solat");
  });

  it("prayer times today, tomorrow and by name", async () => {
    expect((await ask("waktu solat")).reply).toContain("Subuh  05:50");
    await ask("waktu solat esok");
    await ask("pukul berapa maghrib lusa");
    expect(prayerCalls).toEqual([["KDH01", "2026-11-25"], ["KDH01", "2026-11-26"], ["KDH01", "2026-11-27"]]);
  });

  it("notes and ideas", async () => {
    expect((await ask("nota: bawa laptop ke kelas")).saved).toBe(1);
    expect((await ask("Idea: AI ROOM untuk client")).reply).toContain("Bank Idea");
    expect(notes.map((n) => n.kind)).toEqual(["nota", "idea"]);
  });

  it("food log", async () => {
    await ask("makan: nasi ayam");
    expect(notes[0]).toMatchObject({ kind: "makan", title: "nasi ayam" });
  });

  it.each([
    ["belanja RM12 nasi lemak", 12, "Nasi lemak"],
    ["beli rm 3.50 teh tarik", 3.5, "Teh tarik"],
    ["bayar RM1,250.00 sewa rumah", 1250, "Sewa rumah"],
    ["RM5 roti canai", 5, "Roti canai"],
  ])("records spending: %s", async (text, amount, title) => {
    const r = await ask(text);
    expect(notes[0]).toMatchObject({ kind: "belanja", amount, title });
    expect(r.reply).toContain(`RM${amount.toFixed(2)}`);
  });

  it("spending summary", async () => {
    notes.push({ kind: "belanja", title: "A", amount: 4, date: today }, { kind: "belanja", title: "B", amount: 6, date: "2026-11-24" });
    expect((await ask("belanja hari ni")).reply).toContain("RM4.00");
    expect((await ask("belanja semalam")).reply).toContain("RM6.00");
    expect((await ask("belanja minggu ni")).reply).toContain("RM10.00");
  });

  it("schedule for tomorrow", async () => {
    notes.push({ kind: "jadual", title: "Kelas English", date: "2026-11-26", time: "10:00" });
    expect((await ask("jadual esok")).reply).toContain("10:00  Kelas English");
    expect((await ask("ada apa lusa")).reply).toContain("tiada jadual");
  });

  it("search notes", async () => {
    notes.push({ kind: "nota", title: "Password wifi masjid", text: "", date: today });
    expect((await ask("cari wifi")).reply).toContain("Jumpa 1");
    expect((await ask("cari kucing")).reply).toContain("Tiada catatan");
  });

  it("creates a chat room and a project", async () => {
    const r = await ask("buat chat baru pasal kelas");
    expect(r.navigate).toMatch(/^#\/chat\//);
    expect(rooms[0].name).toBe("Kelas");
    const p = await ask("buat project baru milogamingstore");
    expect(projects[0].name).toBe("Milogamingstore");
    expect(p.navigate).toBe(`#/project/${projects[0].id}`);
  });

  it("returns null for new things so the second brain can take over", async () => {
    expect(await ask("apa pendapat kau tentang bisnes sewa website?")).toBeNull();
  });
});
