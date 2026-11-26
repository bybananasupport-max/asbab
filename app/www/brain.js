// Asbab's own brain: answers from local notes and rules, with NO AI.
// Ported from web-reference/netlify/lib/brain.mjs (localBrain).
// Only things it cannot answer go to the second brain (Claude, Phase 3).
(function (root, factory) {
  const req = typeof require === "function" ? require : null;
  const api = factory(root.Core || req("./core.js"), root.Money || req("./money.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Brain = api;
})(typeof self !== "undefined" ? self : this, function (Core, Money) {
  const { addDays, hariOf, uid, WAKTU } = Core;
  const { rm, firstAmount } = Money;

  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const cap = (s) => String(s || "").trim().replace(/^./, (c) => c.toUpperCase());

  const HELP = `Ini perkara yang aku boleh buat terus, tanpa guna AI:
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

  // deps: { now() -> {date}, notes(), addNotes(items, source), createRoom(name, extra),
  //         projects(), saveProjects(list), prayerTimes(zone, date) }
  function createBrain(deps) {
    return async function localBrain(text, ctx) {
      const t = norm(text);
      const today = deps.now().date;
      const s = ctx.settings;
      let m;

      if (/^(tolong|help|bantuan|menu|apa kau boleh buat)\??$/.test(t)) return { reply: HELP };

      m = t.match(/^(?:buat|cipta|create|buka)\s+(?:bilik|chat|room)\s+baru(?:\s+(?:untuk|pasal|nama|tentang)?\s*(.+))?$/);
      if (m) {
        const room = await deps.createRoom(cap(m[1] || "Chat baru"));
        return { reply: `Bilik "${room.name}" dah siap. Jom ke sana.`, navigate: `#/chat/${room.id}`, room };
      }

      m = t.match(/^(?:buat|cipta|create|tambah)\s+project\s+baru\s+(.+)$/);
      if (m) {
        const list = await deps.projects();
        const p = { id: uid(), name: cap(m[1]).slice(0, 50), type: "biasa", repo: "", branch: "main", url: "", orbit: "dalam", archived: false, status: null, createdAt: Date.now(), born: true };
        list.push(p);
        await deps.saveProjects(list);
        await deps.createRoom(p.name, { id: `p-${p.id}`, project: p.id });
        return { reply: `Project "${p.name}" dah lahir di orbit. Tetapkan jenis dan repo dalam halaman project.`, navigate: `#/project/${p.id}` };
      }

      if (/(waktu solat|jadual solat|(bila|pukul berapa|pkul brp) (subuh|zohor|zuhur|asar|maghrib|isyak))/.test(t)) {
        const date = whichDay(t, today);
        const p = await deps.prayerTimes(s.zone, date);
        if (!p) return { reply: "Aku tak dapat ambil waktu solat daripada JAKIM sekarang. Semak internet, kemudian cuba lagi." };
        return { reply: `Waktu solat ${label(date, today)} (zon ${s.zone}):\n` + WAKTU.map(([k, n]) => `${n}  ${p[k]}`).join("\n") };
      }

      m = String(text).match(/^\s*(nota|ingat|simpan|idea)\s*:\s*([\s\S]+)$/i);
      if (m) {
        const kind = m[1].toLowerCase() === "idea" ? "idea" : "nota";
        const body = m[2].trim();
        const notes = await deps.addNotes([{ kind, title: body.split("\n")[0].slice(0, 120), text: body }], "manual");
        return { reply: kind === "idea" ? "Idea tu dah jadi bintang baru dalam Bank Idea." : "Dah simpan dalam Catatan.", saved: 1, notes };
      }

      m = String(text).match(/^\s*makan\s*:\s*(.+)$/i);
      if (m) {
        const notes = await deps.addNotes([{ kind: "makan", title: m[1].trim() }], "manual");
        return { reply: `Direkod: makan ${m[1].trim()}.`, saved: 1, notes };
      }

      // "belanja RM12 nasi lemak", "bayar rm 1,250.00 sewa", "RM5 teh tarik"
      m = t.match(/^(?:belanja|beli|bayar)\s+(rm\s?[\d,]+(?:\.\d+)?)\s*(.*)$/) || t.match(/^(rm\s?[\d,]+(?:\.\d+)?)\s+(.+)$/);
      if (m && firstAmount(m[1]) != null) {
        const amount = firstAmount(m[1]);
        const notes = await deps.addNotes([{ kind: "belanja", title: cap(m[2] || "Belanja"), amount }], "manual");
        const total = sumBelanja(await deps.notes(), today, today);
        return { reply: `Direkod ${rm(amount)}. Jumlah belanja hari ni: ${rm(total)}.`, saved: 1, notes };
      }

      if (/^(belanja|berapa (aku )?belanja)/.test(t)) {
        const list = await deps.notes();
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
        const items = (await deps.notes()).filter((n) => n.kind === "jadual" && n.date === date).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        if (!items.length) return { reply: `Dalam catatan aku, tiada jadual untuk ${label(date, today)}.` };
        return { reply: `Jadual ${label(date, today)}:\n` + items.map((n) => `• ${n.time || "--:--"}  ${n.title}`).join("\n") };
      }

      m = t.match(/^cari\s+(.+)$/);
      if (m) {
        const q = m[1];
        const found = (await deps.notes()).filter((n) => norm(`${n.title} ${n.text}`).includes(q)).slice(-10);
        if (!found.length) return { reply: `Tiada catatan yang sebut "${q}".` };
        return { reply: `Jumpa ${found.length} catatan:\n` + found.map((n) => `• ${n.date}  ${n.title}`).join("\n") };
      }

      return null;
    };
  }

  return { createBrain, HELP };
});
