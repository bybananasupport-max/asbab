// Otak Asbab sendiri: jawab dari catatan tanpa AI bila boleh.
// Hanya perkara baharu dihantar kepada otak kedua (Claude).
import { nowMY, addDays, hariOf } from "./time.mjs";
import { prayerTimes, WAKTU } from "./prayer.mjs";
import { notes, addNotes, createRoom, messages, projects, addMessage, bumpUsage } from "./data.mjs";
import { put, uid } from "./store.mjs";

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const cap = (s) => String(s || "").trim().replace(/^./, (c) => c.toUpperCase());
const rm = (n) => `RM${Number(n || 0).toFixed(2)}`;

export const HELP = `Ini perkara yang aku boleh buat terus, tanpa guna AI:
• "waktu solat" atau "waktu solat esok"
• "jadual esok", "kelas hari ni", "ada apa lusa"
• "nota: ..." untuk simpan nota
• "idea: ..." untuk masukkan Bank Idea
• "belanja RM12 nasi lemak" untuk rekod belanja
• "belanja hari ni" atau "belanja minggu ni"
• "makan: nasi ayam" untuk rekod makan
• "cari ..." untuk cari dalam catatan
• "buat chat baru pasal ..." untuk buka bilik chat baru
• "buat project baru ..." untuk tambah project
Selain tu, aku guna otak kedua (Claude) untuk berbincang.`;

function whichDay(t, today) {
  if (/\blusa\b/.test(t)) return addDays(today, 2);
  if (/\b(esok|besok)\b/.test(t)) return addDays(today, 1);
  if (/\bsemalam\b/.test(t)) return addDays(today, -1);
  return today;
}
function label(date, today) {
  if (date === today) return "hari ni";
  if (date === addDays(today, 1)) return "esok";
  if (date === addDays(today, 2)) return "lusa";
  if (date === addDays(today, -1)) return "semalam";
  return `${hariOf(date)} ${date}`;
}
const sumBelanja = (list, from, to) =>
  list.filter((n) => n.kind === "belanja" && n.date >= from && n.date <= to).reduce((a, n) => a + (n.amount || 0), 0);

export async function localBrain(text, ctx) {
  const t = norm(text);
  const today = nowMY().date;
  const s = ctx.settings;
  let m;

  if (/^(tolong|help|bantuan|menu|apa kau boleh buat)\??$/.test(t)) return { reply: HELP };

  m = t.match(/^(?:buat|cipta|create|buka)\s+(?:bilik|chat|room)\s+baru(?:\s+(?:untuk|pasal|nama|tentang)?\s*(.+))?$/);
  if (m) {
    const room = await createRoom(cap(m[1] || "Chat baru"));
    return { reply: `Bilik "${room.name}" dah siap. Jom ke sana.`, navigate: `#/chat/${room.id}`, room };
  }

  m = t.match(/^(?:buat|cipta|create|tambah)\s+project\s+baru\s+(.+)$/);
  if (m) {
    const list = await projects();
    const p = { id: uid(), name: cap(m[1]).slice(0, 50), type: "biasa", repo: "", branch: "main", url: "", orbit: "dalam", archived: false, status: null, createdAt: Date.now(), born: true };
    list.push(p);
    await put("projects", list);
    await createRoom(p.name, { id: `p-${p.id}`, project: p.id });
    return { reply: `Project "${p.name}" dah lahir di orbit. Tetapkan jenis dan repo dalam halaman project.`, navigate: `#/project/${p.id}` };
  }

  if (/(waktu solat|jadual solat|(bila|pukul berapa|pkul brp) (subuh|zohor|zuhur|asar|maghrib|isyak))/.test(t)) {
    const date = whichDay(t, today);
    const p = await prayerTimes(s.zone, date);
    if (!p) return { reply: "Aku tak dapat ambil waktu solat daripada JAKIM sekarang. Cuba lagi sekejap." };
    return { reply: `Waktu solat ${label(date, today)}:\n` + WAKTU.map(([k, n]) => `${n}  ${p[k]}`).join("\n") };
  }

  m = String(text).match(/^\s*(nota|ingat|simpan|idea)\s*:\s*([\s\S]+)$/i);
  if (m) {
    const kind = m[1].toLowerCase() === "idea" ? "idea" : "nota";
    const body = m[2].trim();
    await addNotes([{ kind, title: body.split("\n")[0].slice(0, 120), text: body }], "manual");
    return { reply: kind === "idea" ? "Idea tu dah jadi bintang baru dalam Bank Idea." : "Dah simpan dalam Catatan.", saved: 1 };
  }

  m = String(text).match(/^\s*makan\s*:\s*(.+)$/i);
  if (m) {
    await addNotes([{ kind: "makan", title: m[1].trim() }], "manual");
    return { reply: `Direkod: makan ${m[1].trim()}.`, saved: 1 };
  }

  m = t.match(/^(?:belanja|beli|bayar)\s+rm\s?(\d+(?:\.\d+)?)\s*(.*)$/) || t.match(/^rm\s?(\d+(?:\.\d+)?)\s+(.+)$/);
  if (m) {
    const amount = Number(m[1]);
    await addNotes([{ kind: "belanja", title: cap(m[2] || "Belanja"), amount }], "manual");
    const total = sumBelanja(await notes(), today, today);
    return { reply: `Direkod ${rm(amount)}. Jumlah belanja hari ni: ${rm(total)}.`, saved: 1 };
  }

  if (/^(belanja|berapa (aku )?belanja)/.test(t)) {
    const list = await notes();
    let from = today, to = today, name = "hari ni";
    if (/semalam/.test(t)) { from = to = addDays(today, -1); name = "semalam"; }
    else if (/minggu/.test(t)) { from = addDays(today, -6); name = "7 hari lepas"; }
    else if (/bulan/.test(t)) { from = today.slice(0, 8) + "01"; name = "bulan ni"; }
    const items = list.filter((n) => n.kind === "belanja" && n.date >= from && n.date <= to);
    if (!items.length) return { reply: `Tiada belanja direkod untuk ${name}.` };
    const lines = items.slice(-8).map((n) => `• ${rm(n.amount)} ${n.title}`).join("\n");
    return { reply: `Belanja ${name}: ${rm(sumBelanja(list, from, to))}\n${lines}` };
  }

  const askJadual = (/^(jadual|kelas|ada apa|apa aku ada|aktiviti|ada kelas)\b/.test(t) && !/\bpukul\b|\d/.test(t)) || /\b(ada apa|jadual apa|apa jadual)\b/.test(t);
  if (askJadual && t.length < 60) {
    const date = whichDay(t, today);
    const items = (await notes()).filter((n) => n.kind === "jadual" && n.date === date).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    if (!items.length) return { reply: `Dalam catatan aku, tiada jadual untuk ${label(date, today)}.` };
    return { reply: `Jadual ${label(date, today)}:\n` + items.map((n) => `• ${n.time || "--:--"}  ${n.title}`).join("\n") };
  }

  m = t.match(/^cari\s+(.+)$/);
  if (m) {
    const q = m[1];
    const found = (await notes()).filter((n) => norm(`${n.title} ${n.text}`).includes(q)).slice(-10);
    if (!found.length) return { reply: `Tiada catatan yang sebut "${q}".` };
    return { reply: `Jumpa ${found.length} catatan:\n` + found.map((n) => `• ${n.date}  ${n.title}`).join("\n") };
  }

  return null;
}

export async function buildContext(roomId, text, ctx) {
  const s = ctx.settings;
  const now = nowMY();
  const p = await prayerTimes(s.zone, now.date).catch(() => null);
  const all = await notes();
  const words = [...new Set(norm(text).split(/[^a-z0-9]+/).filter((w) => w.length > 3))];
  const scored = all
    .map((n) => ({ n, score: words.filter((w) => norm(`${n.title} ${n.text}`).includes(w)).length }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.n);
  const upcoming = all.filter((n) => n.kind === "jadual" && n.date >= now.date && n.date <= addDays(now.date, 2));
  const seen = new Set();
  const relevant = [...upcoming, ...scored].filter((n) => !seen.has(n.id) && seen.add(n.id));
  const history = (await messages(roomId)).slice(-12);
  let projectInfo = "";
  if (ctx.room?.project) {
    const pr = (await projects()).find((x) => x.id === ctx.room.project);
    if (pr) projectInfo = `\nBilik ini ialah chat untuk project "${pr.name}" (jenis ${pr.type}${pr.repo ? `, repo ${pr.repo}` : ""}${pr.url ? `, website ${pr.url}` : ""}).`;
  }

  const system = `${s.personality}

Keutamaan Amin (paling penting di atas):
${s.priorities.map((x, i) => `${i + 1}. ${x}`).join("\n")}

Hari ini ${now.hari}, ${now.date}, pukul ${String(now.hh).padStart(2, "0")}:${String(now.mm).padStart(2, "0")} waktu Malaysia. Esok ${addDays(now.date, 1)} (${hariOf(addDays(now.date, 1))}).
${p ? `Waktu solat hari ini: ${WAKTU.map(([k, n]) => `${n} ${p[k]}`).join(", ")}.` : ""}${projectInfo}

Ingatan: kalau mesej Amin mengandungi maklumat yang patut diingat (jadual, tarikh, janji temu, belanja, makanan, idea, fakta penting tentang hidupnya), tambah SATU baris terakhir dalam format tepat ini:
<<NOTA>>[{"kind":"jadual|nota|belanja|makan|idea","title":"ringkas","date":"YYYY-MM-DD","time":"HH:MM","amount":0}]
Isi "time" dan "amount" hanya bila relevan. Jangan tambah baris itu kalau tiada apa yang baharu untuk disimpan, dan jangan sebut baris itu kepada Amin.
Jawab ringkas, sesuai dibaca di telefon.`;

  const prompt = `${relevant.length ? `Catatan Asbab yang berkaitan:\n${relevant.map((n) => `- [${n.kind}] ${n.date}${n.time ? " " + n.time : ""} ${n.title}${n.amount ? " " + rm(n.amount) : ""}${n.text && n.text !== n.title ? ": " + n.text.slice(0, 300) : ""}`).join("\n")}\n\n` : ""}${history.length ? `Perbualan terkini:\n${history.map((m) => `${m.role === "user" ? "Amin" : "Asbab"}: ${m.text}`).join("\n")}\n\n` : ""}Mesej baharu Amin: ${text}`;

  return { system, prompt };
}

export async function finishAI(roomId, raw) {
  let reply = String(raw || "").trim();
  let saved = [];
  const m = reply.match(/<<NOTA>>\s*(\[[\s\S]*?\])\s*$/);
  if (m) {
    reply = reply.slice(0, m.index).trim();
    try { saved = await addNotes(JSON.parse(m[1]), "asbab"); } catch { /* abaikan nota rosak */ }
  }
  reply = reply.replace(/<<NOTA>>[\s\S]*$/, "").trim() || "…";
  const msg = await addMessage(roomId, { role: "asbab", text: reply, ai: true, saved: saved.length });
  await bumpUsage();
  return { message: msg, saved };
}
