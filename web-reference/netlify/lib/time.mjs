// Semua masa Asbab ikut waktu Malaysia.
const TZ = "Asia/Kuala_Lumpur";
const HARI = { Monday: "Isnin", Tuesday: "Selasa", Wednesday: "Rabu", Thursday: "Khamis", Friday: "Jumaat", Saturday: "Sabtu", Sunday: "Ahad" };

export function nowMY(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "long", hourCycle: "h23",
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const hh = Number(p.hour) % 24;
  const mm = Number(p.minute);
  return { date: `${p.year}-${p.month}-${p.day}`, hh, mm, minutes: hh * 60 + mm, hari: HARI[p.weekday] || p.weekday };
}
export function addDays(date, n) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function hariOf(date) {
  const d = new Date(date + "T12:00:00Z");
  return ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"][d.getUTCDay()];
}
export const toMin = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};
export const pad = (n) => String(n).padStart(2, "0");
export const fromMin = (min) => `${pad(Math.floor(((min % 1440) + 1440) % 1440 / 60))}:${pad(((min % 60) + 60) % 60)}`;
