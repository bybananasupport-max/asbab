// Asbab upgrading itself, Phase 7.2: risk rules, forbidden files, approval rules, stages and the request queue.
// Pure functions only, so the rules are unit tested (app/test/upgrade.test.js).
// This file is itself forbidden for Asbab to change: the rules that guard approval cannot be edited by the AI.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Upgrade = api;
})(typeof self !== "undefined" ? self : this, function () {
  const LEVELS = ["rendah", "sederhana", "tinggi"];
  const higher = (a, b) => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);

  // Files Asbab may never change (any agent): its own rules, the approval steps and the keystore workflow.
  const FORBIDDEN = [
    /^CLAUDE\.md$/i, /^AGENTS\.md$/i, /^GEMINI\.md$/i,
    /^app\/www\/upgrade\.js$/, /^app\/test\/upgrade\.test\.js$/,
    /^\.github\/workflows\/keystore\.ya?ml$/,
  ];
  // High risk: lock and security, keys and tokens, backup, phone access, Android permissions,
  // Mod Bilal and alarms, deleting data, GitHub workflows.
  const HIGH = [
    /SecretStore/, /AppLock/, /Backup/i, /backup\.js$/, /Capture/, /ScreenReader/, /Usage\.kt$/, /Overlay/,
    /AndroidManifest\.xml$/, /Scheduler/, /Planner/, /Receivers/, /Sound\.kt$/, /Notifier/,
    /store\.js$/, /AsbabDb/, /Repo\.kt$/, /github\.js$/, /^\.github\//, /keystore/i, /capacitor\.config/, /build\.gradle$/,
  ];
  // Low risk: looks only (text, colours, icons, layout).
  const LOW = [/\.css$/, /icons\.js$/, /\.svg$/, /\.png$/, /\.md$/i, /\/res\/(values|drawable|layout)\//];
  const HIGH_WORDS = /\b(kunci|keselamatan|password|kata laluan|pin|key api|api key|token|backup|sandaran data|akses telefon|notifikasi app lain|skrin|kebenaran|permission|mod bilal|azan|alarm|penggera|padam data|hapus data|delete|workflow|keystore)\b/i;
  const LOW_WORDS = /\b(teks|perkataan|ejaan|warna|ikon|icon|susun atur|layout|saiz font|fon|butang)\b/i;

  // Risk from the files a change touches.
  function riskOfFiles(paths) {
    let r = "rendah";
    for (const p of paths || []) {
      if (HIGH.some((re) => re.test(p))) return "tinggi";
      if (!LOW.some((re) => re.test(p))) r = "sederhana";
    }
    return r;
  }
  // Risk guessed from the request text (before any file is known). Never lower than the AI's own guess.
  function riskOfText(text, aiGuess = "rendah") {
    const t = String(text || "");
    const fromText = HIGH_WORDS.test(t) ? "tinggi" : LOW_WORDS.test(t) && !/\b(data|simpan|logik|peringatan|jadual|catatan|chat)\b/i.test(t) ? "rendah" : "sederhana";
    return higher(fromText, LEVELS.includes(aiGuess) ? aiGuess : "sederhana");
  }
  // Checks a set of changed files: forbidden ones block the change.
  function checkFiles(paths) {
    const blocked = (paths || []).filter((p) => FORBIDDEN.some((re) => re.test(String(p).replace(/^\/+/, ""))));
    return { ok: blocked.length === 0, blocked };
  }
  // Changes always go to their own branch and a pull request, never straight to main.
  const branchName = (id) => `asbab/minta-${String(id).replace(/[^a-z0-9-]/gi, "").slice(0, 30)}`;
  const safeBranch = (b) => typeof b === "string" && b.startsWith("asbab/") && b !== "main" && !/\.\.|\s/.test(b);

  // Stages shown on the bar: Spesifikasi · Bekerja · Dibina · Ujian · Dipasang.
  const STAGES = ["spesifikasi", "bekerja", "dibina", "ujian", "dipasang"];
  const STAGE_NAMES = { spesifikasi: "Spesifikasi", giliran: "Dalam giliran", bekerja: "Bekerja", dibina: "Dibina", ujian: "Ujian", dipasang: "Dipasang", gagal: "Gagal", ditolak: "Dibatalkan" };
  const stageIndex = (s) => (s === "giliran" ? 0 : s === "gagal" ? 2 : STAGES.indexOf(s));

  // What must be true before the hold-to-approve button works.
  function canApprove(req) {
    if (!req || req.stage !== "ujian") return { ok: false, why: "Versi ujian belum sedia." };
    if (req.risk === "rendah") return { ok: true };
    if (!req.tested) return { ok: false, why: "Cuba versi ujian dulu." };
    if (req.risk === "tinggi") {
      const list = req.checklist || [];
      const left = list.filter((c) => !c.done);
      if (left.length) return { ok: false, why: `Tandakan semua senarai semak dulu (${left.length} lagi).` };
    }
    return { ok: true };
  }
  // Extra checklist items for high risk changes (added to the AI's own list).
  const HIGH_CHECKS = ["APK ujian dah dicuba", "Semakan kedua dah dibuat", "Backup terkini dah diambil"];
  function withRiskChecks(list, risk) {
    const items = (Array.isArray(list) ? list : []).map((x) => ({ text: String(x.text || x).slice(0, 160), done: !!x.done })).filter((x) => x.text).slice(0, 12);
    if (risk === "tinggi") for (const t of HIGH_CHECKS) if (!items.some((x) => x.text === t)) items.push({ text: t, done: false });
    return items;
  }

  // One request works at a time; the rest wait in line (oldest first).
  const ACTIVE = ["bekerja", "dibina"];
  function nextInQueue(reqs) {
    if ((reqs || []).some((r) => ACTIVE.includes(r.stage))) return null;
    return (reqs || []).filter((r) => r.stage === "giliran").sort((a, b) => a.queuedAt - b.queuedAt)[0] || null;
  }

  // The AI's spec: <<SPEK>>{"tajuk":"..","ringkas":"..","senarai":["..",".."],"risiko":"rendah|sederhana|tinggi","baharu":".."}
  function parseSpec(raw, requestText = "") {
    const text = String(raw || "");
    const m = text.match(/<<SPEK>>\s*(\{[^\n]*\})/);
    let o = null;
    if (m) { try { o = JSON.parse(m[1]); } catch { o = null; } }
    const body = (m ? text.slice(0, m.index) + text.slice(m.index + m[0].length) : text).trim();
    const risk = riskOfText(requestText, o && o.risiko);
    return {
      title: String((o && o.tajuk) || requestText || "Permintaan").slice(0, 80),
      spec: body,
      summary: String((o && o.ringkas) || "").slice(0, 300),
      whatsNew: String((o && o.baharu) || (o && o.ringkas) || "").slice(0, 300),
      risk,
      checklist: withRiskChecks((o && Array.isArray(o.senarai) ? o.senarai : []), risk),
    };
  }
  const SPEC_PROMPT = `Amin minta perubahan pada app Asbab sendiri. Tulis spesifikasi ringkas dalam Bahasa Melayu mudah: apa yang berubah, di skrin mana, dan apa yang TIDAK berubah. Kemudian tambah SATU baris terakhir dalam format tepat ini:
<<SPEK>>{"tajuk":"..","ringkas":"satu ayat","senarai":["perkara untuk diuji 1","perkara 2"],"risiko":"rendah|sederhana|tinggi","baharu":"ayat 'Apa yang baharu' untuk Amin"}
Risiko: rendah = teks, warna, ikon, susun atur, butang tanpa sentuh data. sederhana = ciri baharu, logik chat/catatan/jadual/peringatan, struktur data. tinggi = kunci dan keselamatan, key/token, backup, akses telefon, kebenaran Android, Mod Bilal dan alarm, pemadaman data, workflow GitHub.
Fail yang tak boleh diubah: CLAUDE.md, AGENTS.md, GEMINI.md, app/www/upgrade.js, app/test/upgrade.test.js, .github/workflows/keystore.yml.`;

  // Issue text for an agent working in GitHub (e.g. Gemini). Mentions the agent only when it is set up.
  function issueBody(req, mention) {
    return `${mention ? `${mention} ` : ""}Tolong laksanakan permintaan ini dalam repo ini.

## Permintaan
${req.text || req.title}

## Spesifikasi
${req.spec || req.summary || ""}

## Senarai semak
${(req.checklist || []).map((c) => `- [ ] ${c.text}`).join("\n")}

## Peraturan
- Tahap risiko: **${req.risk}**.
- Kerja dalam branch \`${branchName(req.id)}\` dan buka pull request ke \`main\`. Jangan commit terus ke main.
- Jangan ubah: CLAUDE.md, AGENTS.md, GEMINI.md, app/www/upgrade.js, app/test/upgrade.test.js, .github/workflows/keystore.yml.
- Ikut AGENTS.md. Jalankan \`npm test\` dalam folder app sebelum siap.

(Permintaan Asbab #${req.id})`;
  }

  // Rough cost of a request: tokens from text length (about 4 characters a token) and minutes worked.
  const estTokens = (...texts) => Math.round(texts.reduce((n, t) => n + String(t || "").length, 0) / 4);
  const minutes = (from, to = Date.now()) => (from ? Math.max(0, Math.round((to - from) / 60000)) : 0);

  return { LEVELS, FORBIDDEN, riskOfFiles, riskOfText, checkFiles, branchName, safeBranch, STAGES, STAGE_NAMES, stageIndex, canApprove, withRiskChecks, HIGH_CHECKS, nextInQueue, parseSpec, SPEC_PROMPT, issueBody, estTokens, minutes };
});
