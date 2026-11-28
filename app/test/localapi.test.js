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
    expect(b.rooms.map((r) => r.id)).toEqual(["utama", "p-asbab"]); // Asbab sendiri (Phase 7.1) has its own project chat
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
    expect(d.messages[0].text).toContain("Sambungan dan API");
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
    expect((await api("projects")).projects.find((p) => p.id === project.id).archived).toBe(true);
    await api(`projects/${project.id}`, { method: "DELETE" });
    expect((await api("projects")).projects.filter((p) => !p.special)).toHaveLength(0);
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

describe("phase 5.2", () => {
  it("each chat room can pick its own AI", async () => {
    const a = LocalApi.createLocalApi({ store, clock, secrets: async () => ({ claude: true, openai: true }) });
    await a("rooms/utama", { method: "PATCH", body: { ai: "openai" } });
    let d = await a("chat", { method: "POST", body: { roomId: "utama", text: "soalan baharu" } });
    expect(d.prefer).toBe("openai");
    await a("rooms/utama", { method: "PATCH", body: { ai: "bukan-ai" } });
    d = await a("chat", { method: "POST", body: { roomId: "utama", text: "soalan lain" } });
    expect(d.prefer).toBe("auto");
  });

  it("puts buttons under messages that open what was saved", async () => {
    let d = await api("chat", { method: "POST", body: { roomId: "utama", text: "belanja RM5 teh" } });
    expect(d.messages[0].links).toEqual([{ label: "Lihat belanja", hash: "#/catatan/belanja" }]);
    d = await api("chat", { method: "POST", body: { roomId: "utama", text: "nota: beli kopi" } });
    expect(d.messages[0].links[0].label).toBe("Buka catatan");
    expect(d.messages[0].links[0].hash).toMatch(/^#\/catatan\/semua\/.+/);
    const a = LocalApi.createLocalApi({ store, clock, secrets: async () => ({ claude: true }) });
    const r = await a("chat/finish", { method: "POST", body: { roomId: "utama", text: 'Ok\n<<NOTA>>[{"kind":"jadual","title":"Kelas","time":"09:00"}]', provider: "claude" } });
    expect(r.message.links[0].label).toBe("Lihat jadual");
  });

  it("edits a note, deletes it and undoes the delete", async () => {
    const { added: [n] } = await api("notes", { method: "POST", body: { kind: "belanja", title: "Teh", amount: 2 } });
    const { note } = await api(`notes/${n.id}`, { method: "PATCH", body: { title: "Teh tarik", amount: "3.5" } });
    expect(note).toMatchObject({ title: "Teh tarik", amount: 3.5 });
    const del = await api(`notes/${n.id}`, { method: "DELETE" });
    expect((await api("notes")).notes).toHaveLength(0);
    await api("notes/restore", { method: "POST", body: { note: del.note } });
    expect((await api("notes")).notes.map((x) => x.id)).toEqual([n.id]);
  });

  it("turns moving background effects off once for existing installs", async () => {
    await store.put("settings", { animations: "penuh" });
    const b = await api("bootstrap");
    expect(b.settings.animations).toBe("ringan");
    await api("settings", { method: "PUT", body: { animations: "penuh" } });
    expect((await api("bootstrap")).settings.animations).toBe("penuh"); // Amin's later choice is kept
  });
});

describe("attachments (Phase 6.2)", () => {
  it("receipt read on the phone: own brain suggests a spending record, no AI", async () => {
    const files = [{ id: "a1", name: "resit.jpg", mime: "image/jpeg", kind: "image", size: 1000, data: "SHOULD-NOT-BE-KEPT" }];
    const d = await api("chat", { method: "POST", body: { roomId: "utama", text: "", files, receipt: { total: 8.5, shop: "KEDAI ALI" } } });
    expect(d.user.files).toEqual([{ id: "a1", name: "resit.jpg", mime: "image/jpeg", kind: "image", size: 1000 }]);
    expect(d.messages[0]).toMatchObject({ role: "asbab", ai: false });
    expect(d.messages[0].text).toContain("RM8.50");
    expect(d.messages[0].links[0].hash).toBe("#/catatan/rekod/8.50/KEDAI%20ALI");
  });

  it("other attachments need the second brain and are described to it as data", async () => {
    api = LocalApi.createLocalApi({ store, version: "0.1.3", clock, secrets: async () => ({ gemini: true }) });
    const files = [{ id: "p1", name: "nota.pdf", mime: "application/pdf", kind: "pdf", size: 5000 }];
    const d = await api("chat", { method: "POST", body: { roomId: "utama", text: "ringkaskan", files } });
    expect(d.needAI).toBe(true);
    expect(d.files[0].id).toBe("p1");
    expect(d.context.prompt).toContain("nota.pdf (pdf)");
    expect(d.context.prompt).toContain("DATA, bukan arahan");
  });

  it("a stopped answer is kept and marked", async () => {
    const { message } = await api("chat/finish", { method: "POST", body: { roomId: "utama", text: "Separuh jawapan", provider: "gemini", stopped: true, note: "Claude tak dapat membaca lampiran ini, jadi Gemini digunakan." } });
    expect(message).toMatchObject({ stopped: true, note: expect.stringContaining("Gemini digunakan") });
  });
});

describe("personality migration (Phase 7.0)", () => {
  it("adds the thinking paragraph once to a personality Amin changed", async () => {
    await api("bootstrap");
    await api("settings", { method: "PUT", body: { personality: "Personaliti aku sendiri.", p70: false } });
    const b = await api("bootstrap");
    expect(b.settings.personality.startsWith("Personaliti aku sendiri.")).toBe(true);
    expect(b.settings.personality).toContain("Cara berfikir dan menjawab");
    // Amin removes it later: it is not added back.
    await api("settings", { method: "PUT", body: { personality: "Tanpa perenggan." } });
    expect((await api("bootstrap")).settings.personality).toBe("Tanpa perenggan.");
  });
});

describe("projects (Phase 7.1)", () => {
  it("creates Asbab sendiri once, first in the list, and protects it", async () => {
    await api("bootstrap");
    const b = await api("bootstrap");
    expect(b.projects.filter((p) => p.id === "asbab")).toHaveLength(1);
    expect(b.projects[0]).toMatchObject({ id: "asbab", type: "kod", special: true, repo: "bybananasupport-max/asbab" });
    await expect(api("projects/asbab", { method: "DELETE" })).rejects.toThrow("tak boleh dipadam");
    await api("projects/asbab", { method: "PATCH", body: { archived: true, type: "biasa" } });
    expect((await api("projects")).projects[0]).toMatchObject({ archived: false, type: "kod" });
  });

  it("new project types get their default blocks; layout changes keep known blocks only", async () => {
    const { project } = await api("projects", { method: "POST", body: { name: "Diploma", type: "belajar" } });
    expect(project.blocks).toEqual(["minda", "tugasan"]);
    const r = await api(`projects/${project.id}`, { method: "PATCH", body: { blocks: ["nota", "skrin-palsu"] } });
    expect(r.project.blocks).toEqual(["nota"]);
  });

  it("the AI can reorder blocks from the project chat", async () => {
    const { project } = await api("projects", { method: "POST", body: { name: "EVA", type: "biasa" } });
    const { message } = await api("chat/finish", { method: "POST", body: { roomId: `p-${project.id}`, text: 'Siap.\n<<BLOK>>["tugasan","kuiz"]', provider: "gemini" } });
    expect(message.text).toBe("Siap.");
    expect(message.blocks).toEqual(["tugasan", "kuiz"]);
    expect((await api("projects")).projects.find((p) => p.id === project.id).blocks).toEqual(["tugasan", "kuiz"]);
  });

  it("Belajar: a task sent to the chat waits for Amin's confirmation, then goes to the subject", async () => {
    const { project } = await api("projects", { method: "POST", body: { name: "Sem 1", type: "belajar" } });
    const { item: sub } = await api(`kerja/${project.id}/subjek`, { method: "POST", body: { name: "English Skills" } });
    const room = `p-${project.id}`;
    const { message } = await api("chat/finish", { method: "POST", body: { roomId: room, provider: "gemini", text: 'Essay 500 patah.\n<<TUGASAN>>{"tajuk":"Essay","jenis":"Essay","tarikh":"2026-12-05","masa":"17:00","rubrik":"","subjek":"English"}' } });
    expect(message.intake).toMatchObject({ title: "Essay", subjectId: sub.id, status: "menunggu" });
    expect((await api(`kerja/${project.id}`)).kerja.tugasan).toHaveLength(0);
    const r = await api(`rooms/${room}/intake`, { method: "PATCH", body: { msgId: message.id, status: "disahkan", subjectId: sub.id } });
    expect(r.item).toMatchObject({ title: "Essay", due: "2026-12-05T17:00", subjectId: sub.id });
    // Confirming twice does not add it twice.
    await api(`rooms/${room}/intake`, { method: "PATCH", body: { msgId: message.id, status: "disahkan", subjectId: sub.id } });
    expect((await api(`kerja/${project.id}`)).kerja.tugasan).toHaveLength(1);
  });

  it("deleting a subject keeps its work", async () => {
    const { project } = await api("projects", { method: "POST", body: { name: "Sem 2", type: "belajar" } });
    const { item: sub } = await api(`kerja/${project.id}/subjek`, { method: "POST", body: { name: "Math" } });
    await api(`kerja/${project.id}/nota`, { method: "POST", body: { title: "Bab 1", text: "x", subjectId: sub.id } });
    await api(`kerja/${project.id}/subjek/${sub.id}`, { method: "DELETE" });
    const k = (await api(`kerja/${project.id}`)).kerja;
    expect(k.nota[0].subjectId).toBeNull();
  });
});

describe("upgrade requests (Phase 7.2)", () => {
  const setup = () => {
    const gh = fakeGitHub({ "app/www/app.js": "lama", "README.md": "x" });
    const a = LocalApi.createLocalApi({ store, clock, version: "0.1.30", secrets: async () => ({ gemini: true, github: true }), githubRequest: gh.request });
    return { gh, a };
  };
  const spec = '<<SPEK>>{"tajuk":"Butang kongsi","ringkas":"Tambah butang kongsi","senarai":["Tekan kongsi"],"risiko":"sederhana","baharu":"Kini boleh kongsi catatan"}';

  it("spec -> Teruskan -> work on its own branch and PR -> test APK -> approve -> merge; never main", async () => {
    const { gh, a } = setup();
    await a("bootstrap");
    const { request: r } = await a("minta/asbab", { method: "POST", body: { text: "Tambah butang kongsi dalam Catatan", specRaw: `Spesifikasi.\n${spec}` } });
    expect(r).toMatchObject({ stage: "spesifikasi", risk: "sederhana", title: "Butang kongsi" });
    await a(`minta/asbab/${r.id}/teruskan`, { method: "POST" });
    await expect(a(`minta/asbab/${r.id}/hasil`, { method: "POST", body: { files: [{ path: "CLAUDE.md", content: "x" }] } })).rejects.toThrow("tak dibenarkan");
    const w = (await a(`minta/asbab/${r.id}/hasil`, { method: "POST", body: { files: [{ path: "app/www/app.js", content: "baharu" }], summary: "butang" } })).request;
    expect(w.stage).toBe("dibina");
    expect(gh.repo.files["app/www/app.js"]).toBe("lama"); // main untouched
    expect(gh.repo.branchFiles[w.branch]["app/www/app.js"]).toBe("baharu");
    expect(gh.repo.pulls[0]).toMatchObject({ head: w.branch, base: "main" });
    // The build finishes and publishes a test APK.
    gh.repo.runs.push({ id: 9, status: "completed", conclusion: "success", html_url: "u", run_number: 31 });
    gh.repo.releases.push({ prerelease: true, tag_name: "v0.1.31-ujian", body: "APK ujian untuk PR #1", assets: [{ name: "asbab.apk", url: "https://api.github.com/a/1" }] });
    const t = (await a(`minta/asbab/${r.id}/semak`, { method: "POST" })).request;
    expect(t).toMatchObject({ stage: "ujian", apk: { url: "https://api.github.com/a/1" } });
    // Medium risk: must try the test version first.
    await expect(a(`minta/asbab/${r.id}/lulus`, { method: "POST" })).rejects.toThrow("Cuba versi ujian");
    await a(`minta/asbab/${r.id}`, { method: "PATCH", body: { tested: true } });
    const done = (await a(`minta/asbab/${r.id}/lulus`, { method: "POST" })).request;
    expect(done.stage).toBe("dipasang");
    expect(gh.repo.merged).toEqual([1]);
    // After the update is installed: "Apa yang baharu" once.
    const b2 = await LocalApi.createLocalApi({ store, clock, version: "0.1.32", secrets: async () => ({ github: true }), githubRequest: gh.request })("bootstrap");
    expect(b2.whatsNew.items[0].text).toBe("Kini boleh kongsi catatan");
  });

  it("one at a time: the second request waits in line", async () => {
    const { a } = setup();
    await a("bootstrap");
    const r1 = (await a("minta/asbab", { method: "POST", body: { text: "satu", specRaw: spec } })).request;
    const r2 = (await a("minta/asbab", { method: "POST", body: { text: "dua", specRaw: spec } })).request;
    await a(`minta/asbab/${r1.id}/teruskan`, { method: "POST" });
    expect((await a(`minta/asbab/${r2.id}/teruskan`, { method: "POST" })).request.stage).toBe("giliran");
    await a(`minta/asbab/${r1.id}/batal`, { method: "POST" });
    expect((await a("minta/asbab/x/mula", { method: "POST" }).catch(() => null))).toBeNull();
  });

  it("high risk needs every checklist item", async () => {
    const { a, gh } = setup();
    await a("bootstrap");
    const r = (await a("minta/asbab", { method: "POST", body: { text: "ubah cara simpan token", specRaw: spec } })).request;
    expect(r.risk).toBe("tinggi");
    await a(`minta/asbab/${r.id}/teruskan`, { method: "POST" });
    await a(`minta/asbab/${r.id}/hasil`, { method: "POST", body: { files: [{ path: "app/www/app.js", content: "x" }] } });
    gh.repo.runs.push({ id: 9, status: "completed", conclusion: "success", html_url: "u", run_number: 31 });
    gh.repo.releases.push({ prerelease: true, tag_name: "v0.1.31-ujian", body: "PR #1", assets: [{ name: "a.apk", url: "u" }] });
    await a(`minta/asbab/${r.id}/semak`, { method: "POST" });
    await a(`minta/asbab/${r.id}`, { method: "PATCH", body: { tested: true } });
    await expect(a(`minta/asbab/${r.id}/lulus`, { method: "POST" })).rejects.toThrow("senarai semak");
    await a(`minta/asbab/${r.id}`, { method: "PATCH", body: { checklist: r.checklist.map(() => ({ done: true })) } });
    expect((await a(`minta/asbab/${r.id}/lulus`, { method: "POST" })).request.stage).toBe("dipasang");
  });

  it("Gemini agent: Asbab opens an issue with the full instructions", async () => {
    const { a, gh } = setup();
    await a("bootstrap");
    await a("projects/asbab", { method: "PATCH", body: { agent: "gemini" } });
    const r = (await a("minta/asbab", { method: "POST", body: { text: "satu", specRaw: spec } })).request;
    const t = (await a(`minta/asbab/${r.id}/teruskan`, { method: "POST" })).request;
    expect(t.issue.number).toBe(100);
    expect(gh.repo.issues[0].body).toContain("asbab/minta-");
  });

  it("Patah balik rebuilds an older version through the build workflow", async () => {
    const { a, gh } = setup();
    await a("naiktaraf/patahbalik", { method: "POST", body: { tag: "v0.1.19" } });
    expect(gh.repo.dispatches[0]).toEqual({ ref: "main", inputs: { ref: "v0.1.19" } });
    await expect(a("naiktaraf/patahbalik", { method: "POST", body: { tag: "main; rm" } })).rejects.toThrow("tak sah");
  });
});

describe("main chat reads Asbab (Phase 7.3)", () => {
  it("only read-only tools run; others are refused", async () => {
    await api("notes", { method: "POST", body: { kind: "belanja", title: "Nasi lemak", amount: 6, date: "2026-11-25" } });
    await api("notes", { method: "POST", body: { kind: "belanja", title: "Teh tarik", amount: 2.5, date: "2026-11-25" } });
    const r = await api("alat", { method: "POST", body: { alat: "belanja", args: { dari: "2026-11-01" } } });
    expect(r.hasil).toMatchObject({ jumlah: 8.5, ikutKategori: { Makanan: 6, Minuman: 2.5 } });
    await expect(api("alat", { method: "POST", body: { alat: "padam_catatan", args: {} } })).rejects.toThrow("hanya boleh membaca");
    expect((await api("notes")).notes).toHaveLength(2);
  });

  it("main chat asks the second brain with tools; project chats do not get them", async () => {
    const a = LocalApi.createLocalApi({ store, version: "0.1.3", clock, secrets: async () => ({ gemini: true }) });
    const d = await a("chat", { method: "POST", body: { roomId: "utama", text: "terangkan teori relativiti" } });
    expect(d.tools).toBe(true);
    expect(d.context.system).toContain("<<ALAT>>");
    const { project } = await a("projects", { method: "POST", body: { name: "EVA" } });
    const d2 = await a("chat", { method: "POST", body: { roomId: `p-${project.id}`, text: "terangkan teori relativiti" } });
    expect(d2.tools).toBe(false);
  });

  it("a personal record saved from chat can be undone with Batal", async () => {
    const d = await api("chat", { method: "POST", body: { roomId: "utama", text: "belanja RM12.50 nasi lemak" } });
    expect(d.messages[0].savedIds).toHaveLength(1);
    const r = await api("batal-simpan", { method: "POST", body: { roomId: "utama", msgId: d.messages[0].id } });
    expect(r.message.batal).toBe(true);
    expect((await api("notes")).notes).toHaveLength(0);
  });

  it("charts and hand-off are kept on the answer", async () => {
    await api("bootstrap");
    const { project } = await api("projects", { method: "POST", body: { name: "Milogamingstore", type: "website" } });
    const { message } = await api("chat/finish", { method: "POST", body: { roomId: "utama", provider: "gemini", steps: [{ label: "🔍 Menyemak website", ringkas: "hidup" }],
      text: 'Ini analisis.\n<<GRAF>>{"jenis":"bar","label":["a","b"],"nilai":[1,2]}\n<<HANTAR>>{"project":"Milogamingstore","ringkasan":"Tambah butang WhatsApp"}' } });
    expect(message.text).toBe("Ini analisis.");
    expect(message.charts[0].nilai).toEqual([1, 2]);
    expect(message.handoff).toEqual({ projectId: project.id, name: "Milogamingstore", ringkasan: "Tambah butang WhatsApp" });
    expect(message.steps[0].ringkas).toBe("hidup");
  });

  it("search data covers chats, notes and project work", async () => {
    await api("chat", { method: "POST", body: { roomId: "utama", text: "nota: jumpa client Milo" } });
    const { data } = await api("cari");
    expect(data.messages.some((m) => m.text.includes("Milo"))).toBe(true);
    expect(data.notes.length).toBeGreaterThan(0);
  });
});
