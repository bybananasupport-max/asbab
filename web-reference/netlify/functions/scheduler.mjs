// Jantung Asbab: bangun setiap 5 minit, semak keadaan, dan mulakan perbualan sendiri.
import { get, put } from "../lib/store.mjs";
import { nowMY, addDays, toMin, fromMin } from "../lib/time.mjs";
import { prayerTimes, WAKTU } from "../lib/prayer.mjs";
import { MAIN_ROOM, settings, addMessage, notes, projects, usageToday, bumpUsage } from "../lib/data.mjs";
import { sendPush } from "../lib/push.mjs";

const WINDOW = 5;

async function once(key, fn) {
  const k = `sent:${key}`;
  if (await get(k)) return false;
  await put(k, Date.now());
  await fn();
  return true;
}

async function say(text, { push = true, room = MAIN_ROOM, title = "Asbab" } = {}) {
  await addMessage(room, { role: "asbab", text, ai: false, proactive: true });
  if (push) await sendPush(title, text, room === MAIN_ROOM ? "/#/chat/utama" : `/#/chat/${room}`);
}

const inWindow = (now, target) => now >= target && now < target + WINDOW;

function quiet(s, min) {
  const a = toMin(s.quietFrom), b = toMin(s.quietTo);
  return a <= b ? min >= a && min < b : min >= a || min < b;
}

export default async () => {
  const s = await settings();
  const now = nowMY();
  const today = now.date;
  const pt = await prayerTimes(s.zone, today).catch(() => null);
  const marks = await get(`solat:${today}`, {});

  // 1. Mod Bilal: solat sentiasa keutamaan tertinggi, tak ikut waktu senyap.
  if (pt) {
    for (const [k, nama] of WAKTU) {
      const t = toMin(pt[k]);
      if (inWindow(now.minutes, t - s.bilalLead)) {
        await once(`${today}:bilal:${k}`, () =>
          say(`${nama} lagi ${s.bilalLead} minit (${pt[k]}). Masa untuk bersiap, dah mandi dan ambil wuduk?`, { title: `Mod Bilal: ${nama}` }));
      }
      if (inWindow(now.minutes, t + 40) && !marks[k]) {
        await once(`${today}:tanya:${k}`, () => say(`Dah solat ${nama}? Tanda dalam Hari Ini bila dah selesai.`));
      }
    }
  }

  // 2. Peringatan jadual: 20 minit sebelum.
  const all = await notes();
  for (const n of all.filter((x) => x.kind === "jadual" && x.date === today && x.time)) {
    if (inWindow(now.minutes, toMin(n.time) - 20)) {
      await once(`${today}:jadual:${n.id}`, () => say(`${n.title} lagi 20 minit (${n.time}). Standby, bro.`));
    }
  }

  // 3. Taklimat pagi, tanpa AI.
  if (inWindow(now.minutes, toMin(s.briefTime))) {
    await once(`${today}:brief`, async () => {
      const jadual = all.filter((x) => x.kind === "jadual" && x.date === today).sort((x, y) => (x.time || "").localeCompare(y.time || ""));
      const semalam = all.filter((x) => x.kind === "belanja" && x.date === addDays(today, -1)).reduce((a, x) => a + (x.amount || 0), 0);
      const down = (await projects()).filter((p) => p.status === "down");
      const lines = [`Selamat pagi, ${s.name}. Ini hari ${now.hari} kau:`];
      lines.push(jadual.length ? jadual.map((j) => `• ${j.time || "--:--"} ${j.title}`).join("\n") : "• Tiada jadual dalam catatan.");
      if (pt) lines.push(`Zohor ${pt.dhuhr}, Asar ${pt.asr}, Maghrib ${pt.maghrib}.`);
      if (semalam) lines.push(`Belanja semalam: RM${semalam.toFixed(2)}.`);
      if (down.length) lines.push(`Perhatian: ${down.map((p) => p.name).join(", ")} sedang down.`);
      await say(lines.join("\n"), { title: "Taklimat pagi" });
    });
  }

  // 4. Check-in petang. Ikut waktu senyap dan had harian.
  if (inWindow(now.minutes, toMin(s.checkinTime)) && !quiet(s, now.minutes)) {
    const count = (await get(`proactive:${today}`, 0)) || 0;
    if (count < s.maxProactive) {
      await once(`${today}:checkin`, async () => {
        let text = `Assalamualaikum ${s.name}. Hari ni kau buat apa, keluar ke mana? Cerita sikit, aku catatkan.`;
        const usage = await usageToday();
        if (s.aiEnabled && process.env.ANTHROPIC_API_KEY && usage.count < s.aiDailyCap) {
          try {
            const r = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
              signal: AbortSignal.timeout(20000),
              body: JSON.stringify({
                model: process.env.ASBAB_MODEL_LIGHT || "claude-haiku-5-5",
                max_tokens: 200,
                system: s.personality,
                messages: [{ role: "user", content: `Tulis satu mesej check-in petang yang ringkas (maksimum 2 ayat) kepada ${s.name}. Tanya tentang harinya. Hari ini ${now.hari}. Jadual hari ini: ${all.filter((x) => x.kind === "jadual" && x.date === today).map((x) => x.title).join(", ") || "tiada"}. Jangan guna senarai.` }],
              }),
            });
            const d = await r.json();
            const out = d.content?.filter((x) => x.type === "text").map((x) => x.text).join("").trim();
            if (out) { text = out; await bumpUsage(); }
          } catch { /* guna mesej lalai */ }
        }
        await say(text);
        await put(`proactive:${today}`, count + 1);
      });
    }
  }

  // 5. Pantau website project, 24 jam.
  const list = await projects();
  let changed = false;
  await Promise.all(list.filter((p) => p.url && !p.archived).map(async (p) => {
    let up = false;
    try {
      const r = await fetch(p.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
      up = r.status < 500;
    } catch { up = false; }
    const status = up ? "ok" : "down";
    if (p.status !== status) {
      if (status === "down") await say(`Website ${p.name} tak dapat dicapai sekarang (${p.url}). Nak aku siasat?`, { room: `p-${p.id}`, title: `${p.name} down` });
      else if (p.status === "down") await say(`Website ${p.name} dah pulih.`, { room: `p-${p.id}`, title: `${p.name} pulih` });
      p.status = status;
      p.checkedAt = Date.now();
      changed = true;
    }
  }));
  if (changed) await put("projects", list);

  return new Response(`ok ${fromMin(now.minutes)}`);
};

export const config = { schedule: "*/5 * * * *" };
