// Asbab core helpers: time, defaults and version logic.
// Pure functions only (no DOM, no storage) so they can be unit tested in Node.
// Works both as a browser global (window.Core) and as a CommonJS module (for Vitest).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Core = api;
})(typeof self !== "undefined" ? self : this, function () {
  /* ---------- Time (always Malaysia time) ---------- */
  const TZ = "Asia/Kuala_Lumpur";
  const HARI = { Monday: "Isnin", Tuesday: "Selasa", Wednesday: "Rabu", Thursday: "Khamis", Friday: "Jumaat", Saturday: "Sabtu", Sunday: "Ahad" };

  function nowMY(d = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "long", hourCycle: "h23",
    }).formatToParts(d);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const hh = Number(p.hour) % 24;
    const mm = Number(p.minute);
    return { date: `${p.year}-${p.month}-${p.day}`, hh, mm, minutes: hh * 60 + mm, hari: HARI[p.weekday] || p.weekday };
  }
  function addDays(date, n) {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function hariOf(date) {
    const d = new Date(date + "T12:00:00Z");
    return ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"][d.getUTCDay()];
  }
  const toMin = (hhmm) => {
    const [h, m] = String(hhmm || "0:0").split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- Defaults (from web-reference/netlify/lib/defaults.mjs) ---------- */
  const PERSONALITY = `Nama kau Asbab. Kau pembantu peribadi Amin, seorang pelajar Diploma IT, bilal, dan pemilik perniagaan sewa website.
Kau satu asbab (sebab/perantara) dalam hidupnya. Allah yang utama; kau membantu, mengingatkan dan memudahkan, tapi tak menggantikan usaha dan tawakal dia.
Cara bercakap: Bahasa Melayu santai, mesra dan ringkas, macam kawan yang boleh dipercayai. Panggil dia "Amin" atau "bro".
Nilai: jujur walaupun pahit, tak mengampu, galakkan dia belajar dan bukan sekadar bergantung pada kau, jaga solat dan akhlak.
Perkara yang kau tak buat: mendakwa jadi doktor atau ahli psikologi, menyokong diet atau tindakan yang membahayakan kesihatan, membalas mesej bagi pihak dia, atau berbelanja tanpa kelulusan.
Bila dia sedih: dengar dulu, jangan terus beri nasihat. Galakkan dia bercakap juga dengan orang yang dia percaya. Kalau ada tanda dia dalam bahaya atau terfikir mencederakan diri, ajak dia hubungi Talian HEAL 15555 atau Befrienders (03-7627 2929) dan orang terdekat dengan segera.`;

  const DEFAULT_SETTINGS = {
    name: "Amin",
    zone: "KDH01",
    lat: 6.12,
    lon: 100.37,
    bilalLead: 20,
    briefTime: "07:30",
    checkinTime: "18:00",
    quietFrom: "00:30",
    quietTo: "05:30",
    maxProactive: 3,
    aiEnabled: true,
    askBeforeAI: false,
    aiDailyCap: 60,
    modelLight: "claude-haiku-5-5",
    modelHeavy: "claude-sonnet-5-5",
    animations: "penuh",
    sound: false,
    priorities: ["Solat", "Kecemasan client dan website down", "Kelas dan tugasan", "Bisnes", "Lain-lain"],
    personality: PERSONALITY,
    blocklist: [],
    retentionDays: 3,
    access: { whatsapp: false, email: false, sms_bank: false, skrin: false, fail: false, penggunaan_app: false },
  };
  const SCENES = ["gunung", "sungai", "bukit", "kampung"];
  const NOTE_KINDS = ["nota", "jadual", "belanja", "makan", "idea", "log"];

  /* ---------- Versions and app updates ---------- */
  // "v0.1.12" -> [0, 1, 12]. Anything after "-" (e.g. "-dev") is ignored.
  function parseVersion(v) {
    const m = String(v || "").trim().replace(/^v/i, "").split("-")[0].match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
    return m ? [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)] : null;
  }
  // Returns 1 if a > b, -1 if a < b, 0 if equal. Unparseable versions count as oldest.
  function compareVersions(a, b) {
    const x = parseVersion(a), y = parseVersion(b);
    if (!x && !y) return 0;
    if (!x) return -1;
    if (!y) return 1;
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    return 0;
  }
  // Turns a GitHub "latest release" API response into what the update screen needs.
  function updateInfo(currentVersion, release) {
    if (!release || !release.tag_name) return { available: false, reason: "no-release" };
    const apk = (release.assets || []).find((a) => /\.apk$/i.test(a.name || ""));
    const latest = String(release.tag_name).replace(/^v/i, "");
    return {
      available: compareVersions(latest, currentVersion) > 0,
      latest,
      current: currentVersion,
      pageUrl: release.html_url || "",
      apkUrl: apk ? apk.browser_download_url : "",
      apkName: apk ? apk.name : "",
      notes: String(release.body || "").slice(0, 600),
    };
  }

  return { TZ, nowMY, addDays, hariOf, toMin, uid, PERSONALITY, DEFAULT_SETTINGS, SCENES, NOTE_KINDS, parseVersion, compareVersions, updateInfo };
});
