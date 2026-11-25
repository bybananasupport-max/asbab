// Asbab local API: the same routes as web-reference/netlify/functions/api.mjs,
// but running inside the phone against the local Store. No server, no password.
//
// Phase 1 scope: rooms, chat (placeholder reply), today (no prayer times yet),
// notes, settings, projects (no GitHub yet), export/import.
// Later phases plug in the own brain (Phase 2), Claude (Phase 3) and GitHub (Phase 5).
(function (root, factory) {
  const api = factory(root.Core || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LocalApi = api;
})(typeof self !== "undefined" ? self : this, function (Core) {
  const { nowMY, addDays, uid, DEFAULT_SETTINGS, SCENES, NOTE_KINDS } = Core;
  const MAIN_ROOM = "utama";

  class ApiError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
  }

  // deps: { store, version, clock?() -> Date }
  function createLocalApi({ store, version = "0.1.0-dev", clock = () => new Date() }) {
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
    async function devlog(text) {
      const list = await get("devlog", []);
      list.unshift({ ts: Date.now(), text });
      await put("devlog", list.slice(0, 300));
    }
    const projects = () => get("projects", []);

    /* ---------- router ---------- */
    async function route(method, [a, b, c], body) {
      const s = await settings();

      if (a === "bootstrap" && method === "GET") {
        const last = await get("version", null);
        if (last !== version) {
          await put("version", version);
          await devlog(last ? `Asbab dinaik taraf ke versi ${version}.` : `Asbab dilahirkan dalam telefon, versi ${version}.`);
        }
        return {
          version, settings: s, rooms: await rooms(), projects: await projects(),
          usage: await usageToday(), ai: false, github: false,
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
        // Phase 1: the own brain (Phase 2) and second brain (Phase 3) are not installed yet.
        const msg = await addMessage(roomId, {
          role: "asbab", ai: false,
          text: "Mesej kau dah disimpan. Otak Asbab sendiri (waktu solat, jadual, nota, belanja) akan dipasang dalam Fasa 2, dan otak kedua (Claude) dalam Fasa 3.",
        });
        return { user, messages: [msg] };
      }

      if (a === "today" && method === "GET") {
        const n = now();
        const all = await notes();
        const byTime = (x, y) => (x.time || "").localeCompare(y.time || "");
        const jadual = all.filter((x) => x.kind === "jadual" && x.date === n.date).sort(byTime);
        const esok = all.filter((x) => x.kind === "jadual" && x.date === addDays(n.date, 1)).sort(byTime);
        const belanja = all.filter((x) => x.kind === "belanja" && x.date === n.date);
        return {
          now: n, prayer: null, prayerTomorrow: null, solat: await get(`solat:${n.date}`, {}),
          jadual, esok, belanja, belanjaTotal: belanja.reduce((x, y) => x + (y.amount || 0), 0),
        };
      }

      if (a === "solat" && method === "POST") {
        const date = body.date || now().date;
        const marks = await get(`solat:${date}`, {});
        if (body.done === false) delete marks[body.waktu];
        else marks[body.waktu] = Date.now();
        await put(`solat:${date}`, marks);
        return { solat: marks };
      }

      if (a === "notes") {
        if (method === "GET") return { notes: await notes(), devlog: await get("devlog", []) };
        if (method === "POST") return { added: await addNotes([body], "manual") };
        if (method === "DELETE" && b) {
          await put("notes", (await notes()).filter((x) => x.id !== b));
          return { ok: true };
        }
      }

      if (a === "settings") {
        if (method === "GET") return { settings: s };
        if (method === "PUT") {
          const next = { ...s, ...body, access: { ...s.access, ...(body.access || {}) } };
          await put("settings", next);
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
          return { project: np };
        }
        if (method === "PATCH" && p && !c) {
          for (const f of ["name", "type", "repo", "branch", "url", "orbit", "archived"]) if (f in body) p[f] = body[f];
          p.born = false;
          await put("projects", list);
          return { project: p };
        }
        if (method === "DELETE" && p && !c) {
          await put("projects", list.filter((x) => x.id !== b));
          await put("rooms", (await rooms()).filter((r) => r.id !== `p-${b}`));
          await del(`msgs:p-${b}`);
          await del(`proposal:${b}`);
          return { ok: true };
        }
        if (c === "proposal" && method === "GET") return { proposal: await get(`proposal:${b}`, null) };
        if (c) throw new ApiError("Project kod (GitHub) akan disambung dalam Fasa 5.");
      }

      if (a === "test" && method === "GET") {
        return { ok: false, detail: "Sambungan Claude dan GitHub akan dipasang dalam Fasa 3." };
      }

      if (a === "weather" && method === "GET") return { rain: false, temp: null };

      if (a === "export" && method === "GET") {
        const out = {};
        for (const k of await keys("")) {
          if (k.startsWith("prayer:") || k.startsWith("sent:")) continue;
          out[k] = await get(k);
        }
        return { asbab: "identiti", version, exportedAt: new Date().toISOString(), data: out };
      }
      if (a === "import" && method === "POST") {
        if (!body || body.asbab !== "identiti" || !body.data || typeof body.data !== "object") throw new ApiError("Fail ni bukan backup identiti Asbab.");
        for (const [k, v] of Object.entries(body.data)) await put(k, v);
        await devlog("Identiti Asbab dipulihkan daripada backup.");
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
