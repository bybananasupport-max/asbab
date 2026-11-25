// API utama Asbab: /api/*
import { json, authed } from "../lib/http.mjs";
import { get, put, del, keys, uid } from "../lib/store.mjs";
import { nowMY, addDays } from "../lib/time.mjs";
import { prayerTimes } from "../lib/prayer.mjs";
import {
  MAIN_ROOM, settings, rooms, createRoom, messages, addMessage, notes, addNotes,
  usageToday, devlog, projects,
} from "../lib/data.mjs";
import { localBrain, buildContext, finishAI } from "../lib/brain.mjs";
import * as git from "../lib/github.mjs";
import { pushReady } from "../lib/push.mjs";

const VERSION = "1.0.0";

export default async (req) => {
  if (!authed(req)) return json({ error: "Password salah." }, 401);
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = req.method;
  const body = method === "GET" || method === "DELETE" ? {} : await req.json().catch(() => ({}));
  try {
    return await route(method, parts, body, url);
  } catch (e) {
    return json({ error: e.message || "Ralat tak dijangka." }, e.status && e.status < 500 ? e.status : 500);
  }
};

async function route(method, [a, b, c], body, url) {
  const s = await settings();

  if (a === "bootstrap" && method === "GET") {
    const last = await get("version", null);
    if (last !== VERSION) {
      await put("version", VERSION);
      await devlog(last ? `Asbab dinaik taraf ke versi ${VERSION}.` : `Asbab dilahirkan, versi ${VERSION}.`);
    }
    return json({
      version: VERSION, settings: s, rooms: await rooms(), projects: await projects(),
      usage: await usageToday(), pushKey: pushReady() ? process.env.VAPID_PUBLIC_KEY : null,
      ai: !!process.env.ANTHROPIC_API_KEY, github: !!process.env.GITHUB_TOKEN,
    });
  }

  // ---------- Bilik chat ----------
  if (a === "rooms") {
    if (method === "GET" && b) {
      const list = await rooms();
      const r = list.find((x) => x.id === b);
      if (r && r.unread) { r.unread = 0; await put("rooms", list); }
      return json({ room: r, messages: await messages(b) });
    }
    if (method === "POST") return json({ room: await createRoom(body.name) });
    if (method === "PATCH" && b) {
      const list = await rooms();
      const r = list.find((x) => x.id === b);
      if (r && body.name) r.name = String(body.name).slice(0, 60);
      await put("rooms", list);
      return json({ room: r });
    }
    if (method === "DELETE" && b) {
      if (b === MAIN_ROOM) return json({ error: "Bilik utama Asbab tak boleh dipadam." }, 400);
      await put("rooms", (await rooms()).filter((x) => x.id !== b));
      await del(`msgs:${b}`);
      return json({ ok: true });
    }
  }

  // ---------- Chat ----------
  if (a === "chat" && !b && method === "POST") {
    const text = String(body.text || "").trim();
    const roomId = body.roomId || MAIN_ROOM;
    if (!text) return json({ error: "Mesej kosong." }, 400);
    const room = (await rooms()).find((r) => r.id === roomId);
    if (!room) return json({ error: "Bilik tak wujud." }, 404);
    const user = body.skipUser ? null : await addMessage(roomId, { role: "user", text });

    const local = await localBrain(text, { settings: s, room });
    if (local) {
      const msg = await addMessage(roomId, { role: "asbab", text: local.reply, ai: false, saved: local.saved || 0 });
      return json({ user, messages: [msg], navigate: local.navigate || null });
    }
    if (!s.aiEnabled || !process.env.ANTHROPIC_API_KEY) {
      const msg = await addMessage(roomId, {
        role: "asbab", ai: false,
        text: "Aku dalam mod tanpa AI sekarang, jadi aku cuma boleh jawab perkara yang dah ada dalam catatan aku. Taip \"tolong\" untuk senarai perkara yang aku boleh buat.",
      });
      return json({ user, messages: [msg] });
    }
    const usage = await usageToday();
    if (usage.count >= s.aiDailyCap) {
      const msg = await addMessage(roomId, { role: "asbab", ai: false, text: `Had otak kedua hari ni (${s.aiDailyCap} kali) dah capai. Aku masih boleh jawab apa yang ada dalam catatan.` });
      return json({ user, messages: [msg] });
    }
    if (s.askBeforeAI && !body.allowAI) {
      return json({ user, askAI: true });
    }
    return json({ user, needAI: true, context: await buildContext(roomId, text, { settings: s, room }) });
  }

  if (a === "chat" && b === "finish" && method === "POST") {
    return json(await finishAI(body.roomId || MAIN_ROOM, body.text));
  }

  // ---------- Hari ini ----------
  if (a === "today" && method === "GET") {
    const now = nowMY();
    const [pt, ptTomorrow] = await Promise.all([
      prayerTimes(s.zone, now.date).catch(() => null),
      prayerTimes(s.zone, addDays(now.date, 1)).catch(() => null),
    ]);
    const all = await notes();
    const jadual = all.filter((n) => n.kind === "jadual" && n.date === now.date).sort((x, y) => (x.time || "").localeCompare(y.time || ""));
    const esok = all.filter((n) => n.kind === "jadual" && n.date === addDays(now.date, 1)).sort((x, y) => (x.time || "").localeCompare(y.time || ""));
    const belanja = all.filter((n) => n.kind === "belanja" && n.date === now.date);
    return json({
      now, prayer: pt, prayerTomorrow: ptTomorrow, solat: await get(`solat:${now.date}`, {}),
      jadual, esok, belanja, belanjaTotal: belanja.reduce((x, n) => x + (n.amount || 0), 0),
    });
  }

  if (a === "solat" && method === "POST") {
    const date = body.date || nowMY().date;
    const marks = await get(`solat:${date}`, {});
    marks[body.waktu] = body.done === false ? undefined : Date.now();
    await put(`solat:${date}`, marks);
    return json({ solat: marks });
  }

  // ---------- Catatan ----------
  if (a === "notes") {
    if (method === "GET") return json({ notes: await notes(), devlog: await get("devlog", []) });
    if (method === "POST") return json({ added: await addNotes([body], "manual") });
    if (method === "DELETE" && b) {
      await put("notes", (await notes()).filter((n) => n.id !== b));
      return json({ ok: true });
    }
  }

  // ---------- Tetapan ----------
  if (a === "settings") {
    if (method === "GET") return json({ settings: s });
    if (method === "PUT") {
      const next = { ...s, ...body, access: { ...s.access, ...(body.access || {}) } };
      await put("settings", next);
      if (body.personality && body.personality !== s.personality) await devlog("Fail personaliti Asbab dikemas kini.");
      return json({ settings: next });
    }
  }

  // ---------- Project ----------
  if (a === "projects") {
    const list = await projects();
    const p = b ? list.find((x) => x.id === b) : null;
    if (b && !p) return json({ error: "Project tak wujud." }, 404);

    if (method === "GET" && !b) return json({ projects: list });
    if (method === "POST" && !b) {
      const np = {
        id: uid(), name: String(body.name || "Project baru").slice(0, 50), type: body.type === "kod" ? "kod" : "biasa",
        repo: body.repo || "", branch: body.branch || "main", url: body.url || "", orbit: "dalam",
        archived: false, status: null, createdAt: Date.now(), born: true,
      };
      list.push(np);
      await put("projects", list);
      await createRoom(np.name, { id: `p-${np.id}`, project: np.id });
      return json({ project: np });
    }
    if (method === "PATCH" && p && !c) {
      for (const f of ["name", "type", "repo", "branch", "url", "orbit", "archived"]) if (f in body) p[f] = body[f];
      p.born = false;
      await put("projects", list);
      return json({ project: p });
    }
    if (method === "DELETE" && p) {
      await put("projects", list.filter((x) => x.id !== b));
      await put("rooms", (await rooms()).filter((r) => r.id !== `p-${b}`));
      await del(`msgs:p-${b}`);
      await del(`proposal:${b}`);
      return json({ ok: true });
    }

    const needRepo = () => {
      if (!process.env.GITHUB_TOKEN) throw Object.assign(new Error("GITHUB_TOKEN belum diset dalam Netlify."), { status: 400 });
      if (!p.repo) throw Object.assign(new Error("Project ni belum ada repo GitHub. Tetapkan dalam butiran project."), { status: 400 });
    };

    if (c === "files" && method === "GET") { needRepo(); return json({ files: await git.tree(p.repo, p.branch) }); }
    if (c === "read" && method === "POST") {
      needRepo();
      const out = [];
      let total = 0;
      for (const path of (body.paths || []).slice(0, 15)) {
        const clean = git.cleanPath(path);
        if (!clean) continue;
        const f = await git.read(p.repo, p.branch, clean);
        if (!f.exists || f.tooBig) continue;
        total += f.content.length;
        if (total > 120000) break;
        out.push({ path: clean, content: f.content });
      }
      return json({ files: out });
    }
    if (c === "proposal" && method === "GET") return json({ proposal: await get(`proposal:${b}`, null) });
    if (c === "proposal" && method === "POST") {
      needRepo();
      const files = [];
      for (const f of (body.files || []).slice(0, 30)) {
        const clean = git.cleanPath(f.path);
        if (!clean) continue;
        const orig = await git.read(p.repo, p.branch, clean);
        files.push({ path: clean, content: String(f.content), original: orig.content, exists: orig.exists });
      }
      if (!files.length) return json({ error: "Cadangan tiada fail yang sah." }, 400);
      const proposal = {
        id: uid(), task: String(body.task || ""), summary: String(body.summary || "Perubahan project"),
        risk: ["rendah", "sederhana", "tinggi"].includes(body.risk) ? body.risk : "sederhana",
        explain: String(body.explain || ""), files, status: "menunggu", ts: Date.now(),
      };
      await put(`proposal:${b}`, proposal);
      p.pending = true;
      await put("projects", list);
      await addMessage(`p-${b}`, { role: "asbab", ai: true, text: `Cadangan sedia: ${proposal.summary}`, card: "proposal" });
      return json({ proposal });
    }
    if (c === "approve" && method === "POST") {
      needRepo();
      const prop = await get(`proposal:${b}`, null);
      if (!prop || prop.status !== "menunggu") return json({ error: "Tiada cadangan yang menunggu kelulusan." }, 400);
      const result = await git.commit(p.repo, p.branch, prop.files.map((f) => ({ path: f.path, content: f.content })), String(body.message || `Asbab: ${prop.summary}`).slice(0, 300));
      prop.status = "lulus";
      prop.commit = result;
      await put(`proposal:${b}`, prop);
      p.pending = false;
      p.lastDeploy = Date.now();
      await put("projects", list);
      await devlog(`${p.name}: ${prop.summary} (${result.sha.slice(0, 7)})`);
      await addMessage(`p-${b}`, { role: "asbab", ai: false, text: `Dah naik. Commit ${result.sha.slice(0, 7)}. Kalau ada masalah, tekan Patah balik.` });
      return json({ proposal: prop, commit: result });
    }
    if (c === "reject" && method === "POST") {
      const prop = await get(`proposal:${b}`, null);
      if (prop) { prop.status = "ditolak"; await put(`proposal:${b}`, prop); }
      p.pending = false;
      await put("projects", list);
      await addMessage(`p-${b}`, { role: "asbab", ai: false, text: "Cadangan ditolak. Tiada apa yang diubah." });
      return json({ ok: true });
    }
    if (c === "revert" && method === "POST") {
      needRepo();
      const prop = await get(`proposal:${b}`, null);
      if (!prop || prop.status !== "lulus") return json({ error: "Tiada perubahan yang boleh dipatah balik." }, 400);
      const files = prop.files.map((f) => (f.exists ? { path: f.path, content: f.original } : { path: f.path, delete: true }));
      const result = await git.commit(p.repo, p.branch, files, `Asbab: patah balik "${prop.summary}"`);
      prop.status = "dipulihkan";
      prop.revert = result;
      await put(`proposal:${b}`, prop);
      await devlog(`${p.name}: patah balik "${prop.summary}" (${result.sha.slice(0, 7)})`);
      await addMessage(`p-${b}`, { role: "asbab", ai: false, text: "Dah patah balik ke versi sebelum perubahan." });
      return json({ proposal: prop });
    }
  }

  // ---------- Uji sambungan ----------
  if (a === "test" && method === "GET") {
    if (b === "claude") {
      if (!process.env.ANTHROPIC_API_KEY) return json({ ok: false, detail: "ANTHROPIC_API_KEY belum diset." });
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.ASBAB_MODEL_LIGHT || "claude-haiku-5-5", max_tokens: 5, messages: [{ role: "user", content: "Balas: ok" }] }),
      });
      const d = await r.json().catch(() => ({}));
      return json({ ok: r.ok, detail: r.ok ? `model ${d.model || "ok"}` : d.error?.message || `status ${r.status}` });
    }
    if (b === "github") {
      if (!process.env.GITHUB_TOKEN) return json({ ok: false, detail: "GITHUB_TOKEN belum diset." });
      const r = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "user-agent": "asbab" }, signal: AbortSignal.timeout(10000) });
      const d = await r.json().catch(() => ({}));
      return json({ ok: r.ok, detail: r.ok ? `akaun ${d.login}` : d.message || `status ${r.status}` });
    }
  }

  // ---------- Lain-lain ----------
  if (a === "weather" && method === "GET") {
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&current=weather_code,precipitation,temperature_2m&timezone=Asia%2FKuala_Lumpur`, { signal: AbortSignal.timeout(6000) });
      const d = await r.json();
      const code = d.current?.weather_code ?? 0;
      return json({ rain: (code >= 51 && code <= 67) || (code >= 80 && code <= 99), temp: d.current?.temperature_2m ?? null, code });
    } catch {
      return json({ rain: false, temp: null });
    }
  }

  if (a === "push" && b === "subscribe" && method === "POST") {
    const subs = await get("pushsubs", []);
    if (!subs.find((x) => x.endpoint === body.endpoint)) subs.push(body);
    await put("pushsubs", subs);
    return json({ ok: true });
  }

  if (a === "export" && method === "GET") {
    const out = {};
    for (const k of await keys("")) {
      if (k.startsWith("prayer:") || k.startsWith("sent:")) continue;
      out[k] = await get(k);
    }
    return json({ asbab: "identiti", version: VERSION, exportedAt: new Date().toISOString(), data: out });
  }
  if (a === "import" && method === "POST") {
    if (body.asbab !== "identiti" || !body.data) return json({ error: "Fail ni bukan backup identiti Asbab." }, 400);
    for (const [k, v] of Object.entries(body.data)) await put(k, v);
    await devlog("Identiti Asbab dipulihkan daripada backup.");
    return json({ ok: true, count: Object.keys(body.data).length });
  }

  return json({ error: "Laluan tak dikenali." }, 404);
}

export const config = { path: "/api/*" };
