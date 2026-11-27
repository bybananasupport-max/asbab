// Asbab local API: the same routes as web-reference/netlify/functions/api.mjs,
// but running inside the phone against the local Store. No server, no password.
//
// Phase 2 scope: rooms, chat with the own brain (no AI), today with JAKIM prayer times,
// notes, settings, projects (no GitHub yet), export/import.
// Claude arrives in Phase 3 and GitHub in Phase 5.
(function (root, factory) {
  const req = typeof require === "function" ? require : null;
  const api = factory(root.Core || req("./core.js"), root.Brain || req("./brain.js"), root.SecondBrain || req("./secondbrain.js"), root.GitHubApi || req("./github.js"), root.Ai || req("./ai.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LocalApi = api;
})(typeof self !== "undefined" ? self : this, function (Core, Brain, SecondBrain, GitHubApi, Ai) {
  const { nowMY, addDays, uid, DEFAULT_SETTINGS, SCENES, NOTE_KINDS } = Core;
  const MAIN_ROOM = "utama";

  class ApiError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
  }

  // deps:
  //   store                 async key-value store (see store.js)
  //   version               installed app version
  //   clock()               current Date (tests pass a fixed one)
  //   prayerTimes(zone, d)  JAKIM times for one date, or null (native side fetches and caches)
  //   onChange(what)        called after data that affects reminders changes ("schedule")
  //   secrets()             -> { claude: bool, github: bool } which keys are saved (never the keys)
  function createLocalApi({
    store, version = "0.1.0-dev", clock = () => new Date(),
    prayerTimes = async () => null, onChange = () => {},
    secrets = async () => ({ claude: false, github: false }),
    githubRequest = async () => ({ status: 0, data: null, message: "GitHub belum disambung." }),
  }) {
    const git = GitHubApi.createGitHub(githubRequest);
    const { get, put, del, keys } = store;
    const now = () => nowMY(clock());

    /* ---------- data helpers (from netlify/lib/data.mjs) ---------- */
    async function settings() {
      const s = await get("settings", {});
      return { ...DEFAULT_SETTINGS, ...s, access: { ...DEFAULT_SETTINGS.access, ...(s.access || {}) } };
    }
    async function rooms() {
      let list = await get("rooms", []);
      if (!list.find((r) => r.id === MAIN_ROOM)) {
        list = [{ id: MAIN_ROOM, name: "Asbab", pinned: true, scene: "kampung", createdAt: Date.now(), updatedAt: Date.now() }, ...list];
        await put("rooms", list);
      }
      return list;
    }
    async function createRoom(name, extra = {}) {
      const list = await rooms();
      const room = {
        id: extra.id || uid(), name: String(name || "Chat baru").slice(0, 60), pinned: false,
        scene: extra.scene || SCENES[list.length % SCENES.length], createdAt: Date.now(), updatedAt: Date.now(), ...extra,
      };
      if (!list.find((r) => r.id === room.id)) list.push(room);
      await put("rooms", list);
      return room;
    }
    async function touchRoom(id, unread = false) {
      const list = await rooms();
      const r = list.find((x) => x.id === id);
      if (r) {
        r.updatedAt = Date.now();
        if (unread) r.unread = (r.unread || 0) + 1;
        await put("rooms", list);
      }
    }
    const messages = (roomId) => get(`msgs:${roomId}`, []);
    async function addMessage(roomId, msg) {
      const list = await messages(roomId);
      const m = { id: uid(), ts: Date.now(), ...msg };
      list.push(m);
      await put(`msgs:${roomId}`, list.slice(-500));
      await touchRoom(roomId, msg.role === "asbab" && msg.proactive);
      return m;
    }
    const notes = () => get("notes", []);
    async function addNotes(items, source = "asbab") {
      const list = await notes();
      const added = [];
      for (const it of items) {
        if (!it || !it.title) continue;
        const amount = it.amount === "" || it.amount == null ? undefined : Number(it.amount);
        const n = {
          id: uid(), ts: Date.now(), source,
          kind: NOTE_KINDS.includes(it.kind) ? it.kind : "nota",
          title: String(it.title).slice(0, 200), text: String(it.text || "").slice(0, 2000),
          date: it.date || now().date, time: it.time || "",
          amount: Number.isFinite(amount) ? amount : undefined,
        };
        list.push(n);
        added.push(n);
      }
      await put("notes", list);
      return added;
    }
    const usageToday = () => get(`usage:${now().date}`, { count: 0 });
    // Usage per provider: { count: total, by: { gemini: 3, ... } }. On the phone, Kotlin counts each request.
    async function bumpUsage(provider) {
      const key = `usage:${now().date}`;
      const u = await get(key, { count: 0 });
      u.count = (u.count || 0) + 1;
      u.by = { ...(u.by || {}), [provider]: ((u.by || {})[provider] || 0) + 1 };
      await put(key, u);
      return u;
    }
    const keys0 = async () => { try { return await secrets(); } catch { return { github: false }; } };
    async function devlog(text) {
      const list = await get("devlog", []);
      list.unshift({ ts: Date.now(), text });
      await put("devlog", list.slice(0, 300));
    }
    const projects = () => get("projects", []);

    // Buttons under a message that open what Asbab just saved (Phase 5.2).
    function linksFor(saved) {
      const out = [];
      const add = (label, hash) => { if (!out.some((l) => l.hash === hash)) out.push({ label, hash }); };
      for (const n of saved || []) {
        if (n.kind === "belanja") add("Lihat belanja", "#/catatan/belanja");
        else if (n.kind === "jadual") add("Lihat jadual", `#/catatan/jadual/${n.id}`);
        else if (n.kind === "idea") add("Buka idea", `#/catatan/idea/${n.id}`);
        else add("Buka catatan", `#/catatan/semua/${n.id}`);
      }
      return out.slice(0, 3);
    }
    const changed = () => { try { onChange("schedule"); } catch { /* reminders are best effort */ } };
    const prayer = (zone, date) => Promise.resolve(prayerTimes(zone, date)).catch(() => null);

    const localBrain = Brain.createBrain({
      now, notes, addNotes, createRoom, projects, prayerTimes: prayer,
      saveProjects: (list) => put("projects", list),
    });

    /* ---------- router ---------- */
    async function route(method, [a, b, c], body) {
      const s = await settings();

      if (a === "bootstrap" && method === "GET") {
        const last = await get("version", null);
        if (last !== version) {
          await put("version", version);
          await devlog(last ? `Asbab dinaik taraf ke versi ${version}.` : `Asbab dilahirkan dalam telefon, versi ${version}.`);
        }
        // Phase 5.2: moving background effects become OFF by default, once, for existing installs too.
        if (!s.ui52) {
          s.animations = "ringan";
          s.ui52 = true;
          await put("settings", s);
        }
        return {
          version, settings: s, rooms: await rooms(), projects: await projects(),
          usage: await usageToday(), ...(await (async () => { const k = await keys0(); return { ai: Ai.ready(s, k), github: !!k.github, aiKeys: Object.fromEntries(Ai.IDS.map((id) => [id, !!k[id]])) }; })()),
        };
      }

      if (a === "rooms") {
        if (method === "GET" && b) {
          const list = await rooms();
          const r = list.find((x) => x.id === b);
          if (r && r.unread) { r.unread = 0; await put("rooms", list); }
          return { room: r, messages: await messages(b) };
        }
        if (method === "POST") return { room: await createRoom(body.name) };
        if (method === "PATCH" && b) {
          const list = await rooms();
          const r = list.find((x) => x.id === b);
          if (r && body.name) r.name = String(body.name).slice(0, 60);
          if (r && "ai" in body) r.ai = Ai.byId(body.ai) ? body.ai : "auto"; // per-room AI choice (Phase 5.2)
          await put("rooms", list);
          return { room: r };
        }
        if (method === "DELETE" && b) {
          if (b === MAIN_ROOM) throw new ApiError("Bilik utama Asbab tak boleh dipadam.");
          await put("rooms", (await rooms()).filter((x) => x.id !== b));
          await del(`msgs:${b}`);
          return { ok: true };
        }
      }

      if (a === "chat" && !b && method === "POST") {
        const text = String(body.text || "").trim();
        const roomId = body.roomId || MAIN_ROOM;
        if (!text) throw new ApiError("Mesej kosong.");
        const room = (await rooms()).find((r) => r.id === roomId);
        if (!room) throw new ApiError("Bilik tak wujud.", 404);
        const user = body.skipUser ? null : await addMessage(roomId, { role: "user", text });

        // Own brain first: no AI.
        const local = await localBrain(text, { settings: s, room });
        if (local) {
          if (local.saved) changed();
          // Spending limits (Phase 6.1): a gentle warning under the reply.
          const warn = (local.notes || []).some((n) => n.kind === "belanja") ? Core.budgetWarning(await notes(), now().date, s.belanjaHad) : "";
          const msg = await addMessage(roomId, { role: "asbab", text: warn ? `${local.reply}\n${warn}` : local.reply, ai: false, saved: local.saved || 0, links: linksFor(local.notes || []) });
          return { user, messages: [msg], navigate: local.navigate || null };
        }
        // Second brain (Gemini, Claude or OpenAI), only when allowed.
        const k = await keys0();
        if (!Ai.ready(s, k)) {
          const msg = await addMessage(roomId, {
            role: "asbab", ai: false,
            text: s.aiEnabled
              ? "Otak kedua belum disambung. Hidupkan satu penyedia dan tampal key dalam Tetapan > Sambungan dan API. Buat masa ni aku cuma jawab dari catatan aku sendiri. Taip \"tolong\" untuk senarai perkara yang aku boleh buat."
              : "Aku dalam mod tanpa AI sekarang, jadi aku cuma boleh jawab perkara yang dah ada dalam catatan aku. Taip \"tolong\" untuk senarai perkara yang aku boleh buat.",
          });
          return { user, messages: [msg] };
        }
        const usage = await usageToday();
        if (!Ai.chain(s, "chat", { keys: k, used: usage.by || {}, prefer: room.ai }).length) {
          const msg = await addMessage(roomId, { role: "asbab", ai: false, text: "Had harian semua otak kedua dah habis hari ni. Aku masih boleh jawab apa yang ada dalam catatan." });
          return { user, messages: [msg] };
        }
        if (s.askBeforeAI && !body.allowAI) return { user, askAI: true };
        const n = now();
        const project = room.project ? (await projects()).find((x) => x.id === room.project) : null;
        const context = SecondBrain.buildContext(text, {
          settings: s, now: n, prayer: await prayer(s.zone, n.date), notes: await notes(),
          history: (await messages(roomId)).slice(0, -1), project,
        });
        return { user, needAI: true, context, role: "chat", prefer: room.ai || "auto" };
      }

      if (a === "chat" && b === "finish" && method === "POST") {
        const roomId = body.roomId || MAIN_ROOM;
        const { reply, notes: found } = SecondBrain.parseAnswer(body.text, now().date);
        const saved = found.length ? await addNotes(found, "asbab") : [];
        if (saved.length) changed();
        const provider = Ai.byId(body.provider) ? body.provider : "";
        const message = await addMessage(roomId, { role: "asbab", text: reply, ai: true, provider, fallback: !!body.fallback, saved: saved.length, links: linksFor(saved) });
        return { message, saved, usage: await usageToday() };
      }

      // When every provider failed: the own brain answers and says why, in plain Malay.
      if (a === "chat" && b === "fallback" && method === "POST") {
        const message = await addMessage(body.roomId || MAIN_ROOM, { role: "asbab", ai: false, text: String(body.text || "Otak kedua tak dapat dihubungi sekarang.") });
        return { message };
      }

      // Counting happens in Kotlin on the phone; this route is for the browser and tests.
      if (a === "usage" && b === "bump" && method === "POST") return { usage: await bumpUsage(Ai.byId(body.provider) ? body.provider : "gemini") };

      if (a === "today" && method === "GET") {
        const n = now();
        const all = await notes();
        const byTime = (x, y) => (x.time || "").localeCompare(y.time || "");
        const jadual = all.filter((x) => x.kind === "jadual" && x.date === n.date).sort(byTime);
        const esok = all.filter((x) => x.kind === "jadual" && x.date === addDays(n.date, 1)).sort(byTime);
        const belanja = all.filter((x) => x.kind === "belanja" && x.date === n.date);
        const [pt, ptTomorrow] = await Promise.all([prayer(s.zone, n.date), prayer(s.zone, addDays(n.date, 1))]);
        return {
          now: n, prayer: pt, prayerTomorrow: ptTomorrow, solat: await get(`solat:${n.date}`, {}),
          jadual, esok, belanja, belanjaTotal: belanja.reduce((x, y) => x + (y.amount || 0), 0),
        };
      }

      if (a === "solat" && method === "POST") {
        const date = body.date || now().date;
        const marks = await get(`solat:${date}`, {});
        if (body.done === false) delete marks[body.waktu];
        else marks[body.waktu] = Date.now();
        await put(`solat:${date}`, marks);
        changed();
        return { solat: marks };
      }

      if (a === "notes") {
        if (method === "GET") return { notes: await notes(), devlog: await get("devlog", []) };
        if (method === "POST" && !b) {
          const added = await addNotes([body], "manual");
          changed();
          const budget = added.some((n) => n.kind === "belanja") ? Core.budgetWarning(await notes(), now().date, s.belanjaHad) : "";
          return { added, budget };
        }
        if (method === "DELETE" && b) {
          const list = await notes();
          const gone = list.find((x) => x.id === b) || null;
          await put("notes", list.filter((x) => x.id !== b));
          changed();
          return { ok: true, note: gone };
        }
        // Edit a note (Phase 5.2).
        if (method === "PATCH" && b) {
          const list = await notes();
          const n = list.find((x) => x.id === b);
          if (!n) throw new ApiError("Catatan tak wujud.", 404);
          for (const f of ["title", "text", "date", "time"]) if (f in body) n[f] = String(body[f] || "").slice(0, f === "text" ? 2000 : 200);
          if ("kind" in body && NOTE_KINDS.includes(body.kind)) n.kind = body.kind;
          if ("amount" in body) { const a = Number(body.amount); n.amount = body.amount === "" || !Number.isFinite(a) ? undefined : a; }
          await put("notes", list);
          changed();
          return { note: n };
        }
        // "Batal" after deleting: put the same note back.
        if (method === "POST" && b === "restore") {
          const n = body.note;
          if (!n || !n.id || !n.title) throw new ApiError("Tiada catatan untuk dipulihkan.");
          const list = await notes();
          if (!list.some((x) => x.id === n.id)) list.push(n);
          await put("notes", list);
          changed();
          return { note: n };
        }
      }

      if (a === "settings") {
        if (method === "GET") return { settings: s };
        if (method === "PUT") {
          const next = { ...s, ...body, access: { ...s.access, ...(body.access || {}) } };
          await put("settings", next);
          changed();
          if (body.personality && body.personality !== s.personality) await devlog("Fail personaliti Asbab dikemas kini.");
          return { settings: next };
        }
      }

      if (a === "projects") {
        const list = await projects();
        const p = b ? list.find((x) => x.id === b) : null;
        if (b && !p) throw new ApiError("Project tak wujud.", 404);
        if (method === "GET" && !b) return { projects: list };
        if (method === "POST" && !b) {
          const np = {
            id: uid(), name: String(body.name || "Project baru").slice(0, 50), type: body.type === "kod" ? "kod" : "biasa",
            repo: body.repo || "", branch: body.branch || "main", url: body.url || "", orbit: "dalam",
            archived: false, status: null, createdAt: Date.now(), born: true,
          };
          list.push(np);
          await put("projects", list);
          await createRoom(np.name, { id: `p-${np.id}`, project: np.id });
          changed();
          return { project: np };
        }
        if (method === "PATCH" && p && !c) {
          for (const f of ["name", "type", "repo", "branch", "url", "orbit", "archived"]) if (f in body) p[f] = body[f];
          p.born = false;
          if ("url" in body) p.status = null;
          await put("projects", list);
          changed();
          return { project: p };
        }
        if (method === "DELETE" && p && !c) {
          await put("projects", list.filter((x) => x.id !== b));
          await put("rooms", (await rooms()).filter((r) => r.id !== `p-${b}`));
          await del(`msgs:p-${b}`);
          await del(`proposal:${b}`);
          changed();
          return { ok: true };
        }
        // ---------- Code projects (GitHub). Nothing changes in a repo before Amin holds-to-approve. ----------
        const needRepo = async () => {
          if (!(await keys0()).github) throw new ApiError("Token GitHub belum disimpan. Tampal dalam Tetapan > Sambungan dan API.");
          if (!GitHubApi.cleanRepo(p.repo)) throw new ApiError("Project ni belum ada repo GitHub yang sah (contoh: username/nama-repo). Tetapkan dalam Butiran.");
          return GitHubApi.cleanRepo(p.repo);
        };
        const branch = p.branch || "main";
        if (c === "files" && method === "GET") return { files: await git.tree(await needRepo(), branch) };
        if (c === "read" && method === "POST") {
          const repo = await needRepo();
          const out = [];
          let total = 0;
          for (const path of (body.paths || []).slice(0, 15)) {
            const clean = GitHubApi.cleanPath(path);
            if (!clean) continue;
            const f = await git.read(repo, branch, clean);
            if (!f.exists || f.tooBig) continue;
            total += f.content.length;
            if (total > 120000) break;
            out.push({ path: clean, content: f.content });
          }
          return { files: out };
        }
        if (c === "proposal" && method === "GET") return { proposal: await get(`proposal:${b}`, null) };
        if (c === "proposal" && method === "POST") {
          const repo = await needRepo();
          const files = [];
          for (const f of (body.files || []).slice(0, 30)) {
            const clean = GitHubApi.cleanPath(f.path);
            if (!clean) continue;
            const orig = await git.read(repo, branch, clean);
            files.push({ path: clean, content: String(f.content), original: orig.content, exists: orig.exists });
          }
          if (!files.length) throw new ApiError("Cadangan tiada fail yang sah.");
          const proposal = {
            id: uid(), task: String(body.task || ""), summary: String(body.summary || "Perubahan project").slice(0, 200),
            risk: ["rendah", "sederhana", "tinggi"].includes(body.risk) ? body.risk : "sederhana",
            explain: String(body.explain || ""), files, status: "menunggu", ts: Date.now(),
          };
          await put(`proposal:${b}`, proposal);
          p.pending = true;
          await put("projects", list);
          await addMessage(`p-${b}`, { role: "asbab", ai: true, provider: Ai.byId(body.provider) ? body.provider : "", fallback: !!body.fallback, text: `Cadangan sedia: ${proposal.summary}`, card: "proposal" });
          return { proposal };
        }
        if (c === "approve" && method === "POST") {
          const repo = await needRepo();
          const prop = await get(`proposal:${b}`, null);
          if (!prop || prop.status !== "menunggu") throw new ApiError("Tiada cadangan yang menunggu kelulusan.");
          const result = await git.commit(repo, branch, prop.files.map((f) => ({ path: f.path, content: f.content })), String(body.message || `Asbab: ${prop.summary}`).slice(0, 300));
          prop.status = "lulus";
          prop.commit = result;
          await put(`proposal:${b}`, prop);
          p.pending = false;
          p.lastDeploy = Date.now();
          await put("projects", list);
          await devlog(`${p.name}: ${prop.summary} (${result.sha.slice(0, 7)})`);
          await addMessage(`p-${b}`, { role: "asbab", ai: false, text: `Dah naik. Commit ${result.sha.slice(0, 7)}. Kalau ada masalah, tekan Patah balik.` });
          return { proposal: prop, commit: result };
        }
        if (c === "reject" && method === "POST") {
          const prop = await get(`proposal:${b}`, null);
          if (prop) { prop.status = "ditolak"; await put(`proposal:${b}`, prop); }
          p.pending = false;
          await put("projects", list);
          await addMessage(`p-${b}`, { role: "asbab", ai: false, text: "Cadangan ditolak. Tiada apa yang diubah." });
          return { ok: true };
        }
        if (c === "revert" && method === "POST") {
          const repo = await needRepo();
          const prop = await get(`proposal:${b}`, null);
          if (!prop || prop.status !== "lulus") throw new ApiError("Tiada perubahan yang boleh dipatah balik.");
          const files = prop.files.map((f) => (f.exists ? { path: f.path, content: f.original } : { path: f.path, delete: true }));
          const result = await git.commit(repo, branch, files, `Asbab: patah balik "${prop.summary}"`);
          prop.status = "dipulihkan";
          prop.revert = result;
          await put(`proposal:${b}`, prop);
          await devlog(`${p.name}: patah balik "${prop.summary}" (${result.sha.slice(0, 7)})`);
          await addMessage(`p-${b}`, { role: "asbab", ai: false, text: "Dah patah balik ke versi sebelum perubahan." });
          return { proposal: prop };
        }
      }

      if (a === "test" && method === "GET") {
        return { ok: false, detail: "Sambungan Claude dan GitHub akan dipasang dalam Fasa 3." };
      }

      if (a === "weather" && method === "GET") return { rain: false, temp: null };

      if (a === "export" && method === "GET") {
        const out = {};
        for (const k of await keys("")) {
          // Caches, reminder bookkeeping and raw data from other apps never go into a backup.
          if (/^(prayer:|sent:|proactive:|_|ingest$)/.test(k)) continue;
          out[k] = await get(k);
        }
        return { asbab: "identiti", version, exportedAt: new Date().toISOString(), data: out };
      }
      if (a === "import" && method === "POST") {
        if (!body || body.asbab !== "identiti" || !body.data || typeof body.data !== "object") throw new ApiError("Fail ni bukan backup identiti Asbab.");
        for (const [k, v] of Object.entries(body.data)) await put(k, v);
        await devlog("Identiti Asbab dipulihkan daripada backup.");
        changed();
        return { ok: true, count: Object.keys(body.data).length };
      }

      throw new ApiError("Laluan tak dikenali.", 404);
    }

    // Same call shape as the old fetch-based api(): api("rooms/utama", { method, body }).
    return async function api(path, { method = "GET", body } = {}) {
      const parts = String(path).split("?")[0].split("/").filter(Boolean);
      // Copy the body so callers can never mutate stored objects by accident.
      const data = body == null ? {} : JSON.parse(JSON.stringify(body));
      return route(method.toUpperCase(), parts, data);
    };
  }

  return { createLocalApi, ApiError, MAIN_ROOM };
});
