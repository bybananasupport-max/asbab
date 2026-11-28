// Projects, Phase 7.1: types, the block system and the Belajar (study) helpers.
// Pure functions only (no DOM, no storage) so they can be unit tested. Browser global: window.Projects.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Projects = api;
})(typeof self !== "undefined" ? self : this, function () {
  const TYPES = {
    kod: { nama: "Kod", ikut: "repo GitHub", warna: "#8b7cf0" },
    website: { nama: "Website", ikut: "pantau website", warna: "#5fd3c0" },
    belajar: { nama: "Belajar", ikut: "subjek dan assignment", warna: "#f5c542" },
    biasa: { nama: "Biasa", ikut: "chat dan nota", warna: "#a3a8c3" },
  };
  const typeOf = (t) => (TYPES[t] ? t : "biasa");

  // Ready-made blocks. The AI may only pick and order these ids; it never builds new screens.
  const BLOCKS = {
    chat: "Chat",
    minda: "Peta minda",
    tugasan: "Senarai tugasan",
    nota: "Nota",
    kuiz: "Kuiz",
    rakaman: "Rakaman",
    status: "Status website",
    permintaan: "Permintaan",
    binaan: "Binaan",
    graf: "Graf",
    aktiviti: "Aktiviti",
  };
  const DEFAULT_BLOCKS = {
    kod: ["permintaan", "binaan", "aktiviti"],
    website: ["status", "graf", "aktiviti"],
    belajar: ["minda", "tugasan"],
    biasa: ["nota", "tugasan"],
  };
  const defaultBlocks = (type) => DEFAULT_BLOCKS[typeOf(type)].slice();

  // Keeps known block ids only, no repeats, at most 8; falls back to the type's default.
  function cleanBlocks(list, type) {
    const out = [];
    for (const id of Array.isArray(list) ? list : []) {
      const k = String(id || "").trim().toLowerCase();
      if (BLOCKS[k] && !out.includes(k)) out.push(k);
      if (out.length >= 8) break;
    }
    return out.length ? out : defaultBlocks(type);
  }

  // The AI changes the layout with one line at the end of its answer: <<BLOK>>["nota","tugasan"]
  function parseBlocks(raw) {
    const text = String(raw || "");
    const m = text.match(/<<BLOK>>\s*(\[[^\]]*\])/);
    if (!m) return { reply: text, blocks: null };
    let blocks = null;
    try { blocks = JSON.parse(m[1]); } catch { blocks = null; }
    const reply = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() || "Susunan blok dikemas kini.";
    return { reply, blocks: Array.isArray(blocks) ? blocks : null };
  }

  const BLOCK_PROMPT = (type, current) => `Ruang Kerja project ini dibina daripada blok siap: ${Object.entries(BLOCKS).map(([id, n]) => `${id} (${n})`).join(", ")}.
Susunan sekarang: ${JSON.stringify(current)}. Kalau Amin minta ubah, tambah atau buang blok, tambah SATU baris terakhir dalam format tepat ini: <<BLOK>>["id1","id2"]
Guna id dalam senarai sahaja. Jangan tambah baris itu kalau Amin tak minta ubah susunan.`;

  /* ---------- Belajar ---------- */
  // How urgent an assignment is: "lepas" (overdue), "merah" (a day or less), "kuning" (3 days or less), "biasa", "siap".
  function dueLevel(due, now = Date.now(), done = false) {
    if (done) return "siap";
    const t = new Date(due).getTime();
    if (!Number.isFinite(t)) return "biasa";
    const left = t - now;
    if (left < 0) return "lepas";
    if (left <= 24 * 3600e3) return "merah";
    if (left <= 3 * 24 * 3600e3) return "kuning";
    return "biasa";
  }
  // "5 hari 3 jam", "7 jam 20 minit", "12 minit", "Lepas tarikh"
  function dueText(due, now = Date.now()) {
    const t = new Date(due).getTime();
    if (!Number.isFinite(t)) return "Tiada tarikh";
    let s = Math.floor((t - now) / 1000);
    if (s < 0) return "Lepas tarikh";
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60);
    if (d > 0) return `${d} hari ${h} jam`;
    if (h > 0) return `${h} jam ${m} minit`;
    return `${m} minit`;
  }
  // Share of a subject's assignments that are done (0..1), for the progress ring.
  function progress(tasks) {
    const list = Array.isArray(tasks) ? tasks : [];
    return list.length ? list.filter((t) => t.done).length / list.length : 0;
  }

  // The AI's summary of a file or task sent to a Belajar chat:
  // <<TUGASAN>>{"tajuk":"..","jenis":"..","tarikh":"YYYY-MM-DD","masa":"HH:MM","rubrik":"..","subjek":".."}
  function parseIntake(raw, subjects = []) {
    const text = String(raw || "");
    // One line anywhere in the answer (other markers such as <<NOTA>> may follow it).
    const m = text.match(/<<TUGASAN>>\s*(\{[^\n]*\})/);
    if (!m) return { reply: text.trim(), intake: null };
    let o = null;
    try { o = JSON.parse(m[1]); } catch { o = null; }
    const reply = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() || "Aku dah baca tugasan ni.";
    if (!o || typeof o !== "object") return { reply, intake: null };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(o.tarikh || "") ? o.tarikh : "";
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(o.masa || "") ? o.masa : "23:59";
    const name = String(o.subjek || "").trim().toLowerCase();
    const match = subjects.find((s) => s.name.toLowerCase() === name) || subjects.find((s) => name && (s.name.toLowerCase().includes(name) || name.includes(s.name.toLowerCase())));
    return {
      reply,
      intake: {
        title: String(o.tajuk || "Tugasan").slice(0, 120),
        jenis: String(o.jenis || "Assignment").slice(0, 40),
        due: date ? `${date}T${time}` : "",
        rubrik: String(o.rubrik || "").slice(0, 2000),
        subjectId: match ? match.id : null,
        subjekTeka: String(o.subjek || "").slice(0, 60),
      },
    };
  }
  const INTAKE_PROMPT = (subjects) => `Ini chat project Belajar Amin. Subjek yang ada: ${subjects.length ? subjects.map((s) => s.name).join(", ") : "(belum ada)"}.
Bila Amin hantar fail, gambar atau penerangan tugasan/assignment: ringkaskan dengan jelas (jenis, tarikh hantar, rubrik atau kriteria markah), dan teka subjeknya. Kalau tak pasti subjek mana, tanya ("Ini untuk English Skills ke?"). Tambah SATU baris terakhir dalam format tepat ini:
<<TUGASAN>>{"tajuk":"..","jenis":"..","tarikh":"YYYY-MM-DD","masa":"HH:MM","rubrik":"..","subjek":".."}
Jangan simpan apa-apa sendiri; Amin akan sahkan dulu. Mod Belajar: bimbing, rangka dan semak dengan rubrik; jangan tulis assignment untuk Amin. Ingatkan dia ikut polisi AI pensyarah.`;
  const STUDY_PROMPT = (subject) => `Mod Belajar untuk subjek "${subject}": bimbing Amin langkah demi langkah, bantu merangka, semak kerja dia dengan rubrik, dan betulkan bahasa. Amin yang menulis; jangan tulis jawapan penuh assignment untuk dia. Ingatkan dia ikut polisi penggunaan AI pensyarah bila berkaitan.`;

  // Quiz from the AI: <<KUIZ>>[{"s":"soalan","p":["a","b","c","d"],"j":0}]
  function parseQuiz(raw) {
    const text = String(raw || "");
    const m = text.match(/<<KUIZ>>\s*(\[[^\n]*\])/);
    if (!m) return { reply: text.trim(), questions: [] };
    let list = [];
    try { list = JSON.parse(m[1]); } catch { list = []; }
    const questions = (Array.isArray(list) ? list : []).filter((q) => q && typeof q.s === "string" && Array.isArray(q.p) && q.p.length >= 2 && q.p.length <= 6 && Number.isInteger(q.j) && q.j >= 0 && q.j < q.p.length)
      .slice(0, 20).map((q) => ({ s: q.s.slice(0, 300), p: q.p.map((x) => String(x).slice(0, 160)), j: q.j }));
    return { reply: text.slice(0, m.index).trim() || `Kuiz ${questions.length} soalan sedia.`, questions };
  }
  const QUIZ_PROMPT = (subject, n = 5) => `Buat kuiz ${n} soalan aneka pilihan untuk subjek "${subject}" berdasarkan nota dan kuliah di bawah. Tulis satu ayat pengenalan, kemudian SATU baris terakhir dalam format tepat ini:
<<KUIZ>>[{"s":"soalan","p":["pilihan A","pilihan B","pilihan C","pilihan D"],"j":0}]
"j" ialah nombor pilihan yang betul (bermula 0).`;

  const SUBJECT_COLOURS = ["#f5c542", "#5fd3c0", "#8b7cf0", "#f07a72", "#4cc2ff", "#8fd16a", "#ff9f6b"];

  return { TYPES, typeOf, BLOCKS, defaultBlocks, cleanBlocks, parseBlocks, BLOCK_PROMPT, dueLevel, dueText, progress, parseIntake, INTAKE_PROMPT, STUDY_PROMPT, parseQuiz, QUIZ_PROMPT, SUBJECT_COLOURS };
});
