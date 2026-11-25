// Fungsi data yang dikongsi oleh API dan penjadual.
import { get, put, uid } from "./store.mjs";
import { DEFAULT_SETTINGS, SCENES } from "./defaults.mjs";
import { nowMY } from "./time.mjs";

export const MAIN_ROOM = "utama";

export async function settings() {
  const s = await get("settings", {});
  return { ...DEFAULT_SETTINGS, ...s, access: { ...DEFAULT_SETTINGS.access, ...(s.access || {}) } };
}

export async function rooms() {
  let list = await get("rooms", []);
  if (!list.find((r) => r.id === MAIN_ROOM)) {
    list = [{ id: MAIN_ROOM, name: "Asbab", pinned: true, scene: "kampung", createdAt: Date.now(), updatedAt: Date.now() }, ...list];
    await put("rooms", list);
  }
  return list;
}

export async function createRoom(name, extra = {}) {
  const list = await rooms();
  const room = {
    id: extra.id || uid(), name: String(name || "Chat baru").slice(0, 60), pinned: false,
    scene: extra.scene || SCENES[list.length % SCENES.length], createdAt: Date.now(), updatedAt: Date.now(), ...extra,
  };
  if (!list.find((r) => r.id === room.id)) list.push(room);
  await put("rooms", list);
  return room;
}

export async function touchRoom(id, unread = false) {
  const list = await rooms();
  const r = list.find((x) => x.id === id);
  if (r) {
    r.updatedAt = Date.now();
    if (unread) r.unread = (r.unread || 0) + 1;
    await put("rooms", list);
  }
}

export async function messages(roomId) {
  return get(`msgs:${roomId}`, []);
}

export async function addMessage(roomId, msg) {
  const list = await messages(roomId);
  const m = { id: uid(), ts: Date.now(), ...msg };
  list.push(m);
  await put(`msgs:${roomId}`, list.slice(-500));
  await touchRoom(roomId, msg.role === "asbab" && msg.proactive);
  return m;
}

export async function notes() {
  return get("notes", []);
}

export async function addNotes(items, source = "asbab") {
  const list = await notes();
  const added = [];
  for (const it of items) {
    if (!it || !it.title) continue;
    const n = {
      id: uid(), ts: Date.now(), source,
      kind: ["nota", "jadual", "belanja", "makan", "idea", "log"].includes(it.kind) ? it.kind : "nota",
      title: String(it.title).slice(0, 200), text: String(it.text || "").slice(0, 2000),
      date: it.date || nowMY().date, time: it.time || "", amount: it.amount != null ? Number(it.amount) : undefined,
    };
    list.push(n);
    added.push(n);
  }
  await put("notes", list);
  return added;
}

export async function usageToday() {
  return get(`usage:${nowMY().date}`, { count: 0 });
}
export async function bumpUsage() {
  const key = `usage:${nowMY().date}`;
  const u = await get(key, { count: 0 });
  u.count++;
  await put(key, u);
  return u;
}

export async function devlog(text) {
  const list = await get("devlog", []);
  list.unshift({ ts: Date.now(), text });
  await put("devlog", list.slice(0, 300));
}

export async function projects() {
  return get("projects", []);
}
