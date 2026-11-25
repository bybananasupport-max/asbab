// Waktu solat daripada e-Solat JAKIM, disimpan supaya tak perlu ambil berulang kali.
import { get, put } from "./store.mjs";

export const WAKTU = [
  ["fajr", "Subuh"], ["dhuhr", "Zohor"], ["asr", "Asar"], ["maghrib", "Maghrib"], ["isha", "Isyak"],
];
const BULAN = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

function isoFromJakim(s) {
  const [d, m, y] = String(s).split("-");
  return `${y}-${BULAN[m] || m}-${d.padStart(2, "0")}`;
}
const hm = (t) => String(t || "").slice(0, 5);

export async function prayerTimes(zone, date) {
  const cached = await get(`prayer:${zone}:${date}`);
  if (cached) return cached;
  for (const period of ["week", "today"]) {
    try {
      const r = await fetch(`https://www.e-solat.gov.my/index.php?r=esolatApi/TakwimSolat&period=${period}&zone=${zone}`, {
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();
      let found = null;
      for (const p of d.prayerTime || []) {
        const t = {
          date: isoFromJakim(p.date), hijri: p.hijri || "",
          imsak: hm(p.imsak), fajr: hm(p.fajr), syuruk: hm(p.syuruk), dhuhr: hm(p.dhuhr),
          asr: hm(p.asr), maghrib: hm(p.maghrib), isha: hm(p.isha),
        };
        await put(`prayer:${zone}:${t.date}`, t);
        if (t.date === date) found = t;
      }
      if (found) return found;
    } catch { /* cuba cara seterusnya */ }
  }
  return null;
}
