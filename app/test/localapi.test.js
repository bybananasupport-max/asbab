import { describe, it, expect, beforeEach } from "vitest";
import Store from "../www/store.js";
import LocalApi from "../www/localapi.js";
import { fakeGitHub } from "./fakegithub.js";

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

  it("answers with the own brain and labels it (no AI)", async () => {
    const d = await api("chat", { method: "POST", body: { roomId: "utama", text: "belanja RM12.50 nasi lemak" } });
    expect(d.user.text).toBe("belanja RM12.50 nasi lemak");
    expect(d.messages[0]).toMatchObject({ role: "asbab", ai: false, saved: 1 });
    expect(d.messages[0].text).toContain("RM12.50");
  });

  it("is honest when the second brain is not connected", async () => {
    const d = await api("chat", { method: "POST", body: { roomId: "utama", text: "terangkan teori relativiti" } });
    expect(d.messages[0].ai).toBe(false);
    expect(d.messages[0].text).toContain("Sambungan & API");
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
    expect(t.prayer).toBeNull(); // no prayerTimes dependency given
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

  it("explains what is missing before touching GitHub", async () => {
    const { project } = await api("projects", { method: "POST", body: { name: "X" } });
    await expect(api(`projects/${project.id}/files`)).rejects.toThrow("Token GitHub belum disimpan");
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

describe("phase 2 hooks", () => {
  it("passes JAKIM times to Hari Ini and tells the scheduler about changes", async () => {
    const calls = [];
    const pt = { date: "2026-11-25", fajr: "05:50", dhuhr: "13:10", asr: "16:30", maghrib: "19:05", isha: "20:15" };
    const a = LocalApi.createLocalApi({
      store, version: "0.2.0", clock,
      prayerTimes: async (zone, date) => (date === "2026-11-25" ? { ...pt, zone } : null),
      onChange: (what) => calls.push(what),
    });
    const t = await a("today");
    expect(t.prayer).toMatchObject({ fajr: "05:50", zone: "KDH01" });
    expect(t.prayerTomorrow).toBeNull();
    await a("notes", { method: "POST", body: { kind: "jadual", title: "Kelas", time: "14:00" } });
    await a("solat", { method: "POST", body: { waktu: "fajr", done: true } });
    await a("settings", { method: "PUT", body: { bilalLead: 15 } });
    expect(calls).toEqual(["schedule", "schedule", "schedule"]);
  });

  it("survives a failing prayer source", async () => {
    const a = LocalApi.createLocalApi({ store, clock, prayerTimes: async () => { throw new Error("offline"); } });
    expect((await a("today")).prayer).toBeNull();
  });
});

describe("second brain (phase 3)", () => {
  const withKey = () => LocalApi.createLocalApi({ store, version: "0.3.0", clock, secrets: async () => ({ claude: true, github: false }) });

  it("asks for Claude only after the own brain, with personality and untrusted-data rules", async () => {
    const a = withKey();
    expect((await a("bootstrap")).ai).toBe(true);
    const d = await a("chat", { method: "POST", body: { roomId: "utama", text: "apa pendapat kau tentang bisnes?" } });
    expect(d.needAI).toBe(true);
    expect(d.role).toBe("chat");
    expect(d.context.system).toContain("Nama kau Asbab");
    expect(d.context.system).toContain("DATA sahaja");
    expect(d.context.prompt).toContain("Mesej baharu Amin: apa pendapat kau tentang bisnes?");
    // Own brain still answers without AI even when Claude is available.
    expect((await a("chat", { method: "POST", body: { roomId: "utama", text: "tolong" } })).messages[0].ai).toBe(false);
  });

  it("saves notes from the answer (AI teaches once) and remembers which AI answered", async () => {
    const a = withKey();
    const raw = 'Baik, aku ingat kelas tu.\n<<NOTA>>[{"kind":"jadual","title":"Kelas Pengaturcaraan","date":"2026-11-27","time":"09:00"}]';
    const r = await a("chat/finish", { method: "POST", body: { roomId: "utama", text: raw, provider: "claude", fallback: true } });
    expect(r.message).toMatchObject({ ai: true, provider: "claude", fallback: true, text: "Baik, aku ingat kelas tu.", saved: 1 });
    const { notes } = await a("notes");
    expect(notes[0]).toMatchObject({ kind: "jadual", title: "Kelas Pengaturcaraan", date: "2026-11-27", time: "09:00", source: "asbab" });
  });

  it("respects the daily cap, ask-before-AI and the no-AI switch", async () => {
    const a = withKey();
    await a("settings", { method: "PUT", body: { aiDailyCap: 1, askBeforeAI: true } });
    let d = await a("chat", { method: "POST", body: { roomId: "utama", text: "soalan baharu" } });
    expect(d.askAI).toBe(true);
    d = await a("chat", { method: "POST", body: { roomId: "utama", text: "soalan baharu", allowAI: true, skipUser: true } });
    expect(d.needAI).toBe(true);
    await a("usage/bump", { method: "POST", body: { provider: "claude" } });
    d = await a("chat", { method: "POST", body: { roomId: "utama", text: "soalan lain" } });
    expect(d.messages[0].text).toContain("Had harian semua otak kedua");
    await a("settings", { method: "PUT", body: { aiEnabled: false } });
    d = await a("chat", { method: "POST", body: { roomId: "utama", text: "soalan lain" } });
    expect(d.messages[0].text).toContain("mod tanpa AI");
  });
});

describe("code projects (phase 5)", () => {
  it("proposal -> hold-to-approve commit -> patah balik", async () => {
    const gh = fakeGitHub({ "index.html": "<footer></footer>\n" });
    const a = LocalApi.createLocalApi({ store, clock, secrets: async () => ({ claude: true, github: true }), githubRequest: gh.request });
    const { project } = await a("projects", { method: "POST", body: { name: "Milo", type: "kod", repo: "bybanana/milo" } });
    const id = project.id;
    expect((await a(`projects/${id}/files`)).files.map((f) => f.path)).toEqual(["index.html"]);
    expect((await a(`projects/${id}/read`, { method: "POST", body: { paths: ["index.html", "../x"] } })).files).toHaveLength(1);

    const { proposal } = await a(`projects/${id}/proposal`, { method: "POST", body: {
      task: "tambah butang WhatsApp", summary: "Butang WhatsApp di footer", risk: "rendah", explain: "Tambah satu pautan.",
      files: [{ path: "index.html", content: "<footer><a>WhatsApp</a></footer>\n" }, { path: "../hack", content: "x" }],
    } });
    expect(proposal.files).toHaveLength(1);
    expect(proposal.files[0]).toMatchObject({ exists: true, original: "<footer></footer>\n" });
    expect(gh.repo.files["index.html"]).toBe("<footer></footer>\n"); // nothing changes before approval
    expect((await a("projects")).projects[0].pending).toBe(true);

    const ok = await a(`projects/${id}/approve`, { method: "POST" });
    expect(ok.proposal.status).toBe("lulus");
    expect(gh.repo.files["index.html"]).toContain("WhatsApp");
    await expect(a(`projects/${id}/approve`, { method: "POST" })).rejects.toThrow("Tiada cadangan");

    await a(`projects/${id}/revert`, { method: "POST" });
    expect(gh.repo.files["index.html"]).toBe("<footer></footer>\n");
    expect(gh.repo.commits).toEqual(["Asbab: Butang WhatsApp di footer", 'Asbab: patah balik "Butang WhatsApp di footer"']);
  });

  it("rejecting changes nothing", async () => {
    const gh = fakeGitHub({ "a.txt": "1\n" });
    const a = LocalApi.createLocalApi({ store, clock, secrets: async () => ({ claude: true, github: true }), githubRequest: gh.request });
    const { project } = await a("projects", { method: "POST", body: { name: "R", type: "kod", repo: "u/r" } });
    await a(`projects/${project.id}/proposal`, { method: "POST", body: { files: [{ path: "a.txt", content: "2\n" }] } });
    await a(`projects/${project.id}/reject`, { method: "POST" });
    expect(gh.repo.files["a.txt"]).toBe("1\n");
    expect(gh.repo.commits).toEqual([]);
  });

  it("backups leave out caches and raw data", async () => {
    await store.put("prayer:KDH01:2026-11-25", {});
    await store.put("ingest", [{ text: "rahsia" }]);
    await store.put("_paused", true);
    await api("notes", { method: "POST", body: { title: "simpan" } });
    const { data } = await api("export");
    expect(Object.keys(data)).toContain("notes");
    expect(Object.keys(data).some((k) => k.startsWith("prayer:") || k === "ingest" || k.startsWith("_"))).toBe(false);
  });
});
