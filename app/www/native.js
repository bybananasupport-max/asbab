// Thin wrapper around Capacitor native plugins.
// Everything here also works (with safe fallbacks) when the UI is opened in a normal browser.
(function () {
  const cap = window.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const plugin = (name) => (isNative && cap.registerPlugin ? cap.registerPlugin(name) : null);
  const App = plugin("App");
  const Browser = plugin("Browser");
  // Asbab's own Kotlin plugin (app/android/.../AsbabPlugin.kt): database, prayer times, reminders, voice.
  const Asbab = plugin("AsbabNative");

  const REPO = "bybananasupport-max/asbab";

  async function appInfo() {
    if (App) {
      try { return await App.getInfo(); } catch { /* fall through */ }
    }
    return { name: "Asbab", id: "com.bybanana.asbab", version: "0.1.0-dev", build: "0" };
  }

  // Open a web page outside Asbab (Chrome Custom Tab on Android).
  async function openUrl(url) {
    if (Browser) {
      try { await Browser.open({ url }); return; } catch { /* fall through */ }
    }
    window.open(url, "_blank", "noopener");
  }

  // GitHub API through the native plugin (the token stays in Kotlin). Returns {status, data, message}.
  async function github(method, path, body) {
    if (Asbab) {
      const r = await Asbab.github({ method, path, body: body == null ? undefined : JSON.stringify(body) });
      let data = null;
      try { data = r.body ? JSON.parse(r.body) : null; } catch { data = r.body; }
      return { status: r.status, data, message: r.message || "" };
    }
    try {
      const r = await fetch(`https://api.github.com${path}`, { method, headers: { accept: "application/vnd.github+json" }, body: body == null ? undefined : JSON.stringify(body) });
      return { status: r.status, data: await r.json().catch(() => null), message: r.ok ? "" : `GitHub membalas ralat ${r.status}.` };
    } catch {
      return { status: 0, data: null, message: "Tak dapat hubungi GitHub. Semak internet dan cuba lagi." };
    }
  }

  // Ask GitHub for the newest release and compare with the installed version.
  async function checkUpdate() {
    const info = await appInfo();
    const keys = await secretStatus();
    const r = await github("GET", `/repos/${REPO}/releases/latest`);
    if (r.status === 0) return { ok: false, current: info.version, message: r.message };
    if (r.status === 404 || r.status === 401 || r.status === 403) {
      return {
        ok: false, current: info.version, needToken: !keys.github,
        message: keys.github
          ? "Token GitHub tiada akses ke repo Asbab, atau belum ada Release lagi. Pastikan token boleh baca repo bybananasupport-max/asbab."
          : "Repo Asbab private, jadi semakan automatik perlukan token GitHub. Tampal token dalam Tetapan > Sambungan & API, atau buka halaman Release untuk semak sendiri.",
      };
    }
    if (r.status < 200 || r.status > 299) return { ok: false, current: info.version, message: r.message || `GitHub membalas ralat ${r.status}.` };
    return { ok: true, ...Core.updateInfo(info.version, r.data) };
  }

  // Back button: go back in Asbab's own pages, and leave the app only from the main chat.
  if (App) {
    App.addListener("backButton", () => {
      const sheet = document.querySelector(".sheet");
      if (sheet) { sheet.remove(); return; }
      if (location.hash && location.hash !== "#/chat/utama") history.back();
      else App.minimizeApp();
    });
  }

  /* ---------- Phase 2: database, prayer times, reminders, voice ---------- */

  // The data store: SQLite on the phone, or localStorage when the UI is opened in a browser.
  async function openStore() {
    if (!Asbab) return Store.createStore(localStorage);
    const store = Store.createNativeStore(Asbab);
    try {
      const n = await Store.migrateLocalToNative(localStorage, store);
      if (n) console.log(`Asbab: ${n} rekod dipindah ke SQLite.`);
    } catch (e) {
      console.error("Migration failed", e);
    }
    return store;
  }

  async function prayerTimes(zone, date) {
    if (!Asbab) return null;
    return (await Asbab.prayerTimes({ zone, date })).times || null;
  }

  // Re-plan reminders after a change. Many quick changes are merged into one call.
  let timer = null;
  function reschedule() {
    if (!Asbab) return;
    clearTimeout(timer);
    timer = setTimeout(() => Asbab.reschedule().catch(() => {}), 400);
  }

  async function status() {
    if (!Asbab) return { notifications: false, exactAlarms: false, browser: true };
    return Asbab.status();
  }
  const requestNotifications = async () => (Asbab ? (await Asbab.requestNotifications()).granted : false);
  const openSettings = (page) => Asbab?.openSettings({ page });
  const testBilal = (seconds = 10) => Asbab?.testBilal({ seconds });
  const takeRoute = async () => (Asbab ? (await Asbab.takeRoute()).route : null);

  // Voice input in Bahasa Melayu. Native speech recogniser on the phone, Web Speech in a browser.
  const WebSR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canListen = !!(Asbab || WebSR);
  async function listen() {
    if (Asbab) return (await Asbab.listen({ lang: "ms-MY" })).text || "";
    return new Promise((resolve, reject) => {
      const rec = new WebSR();
      rec.lang = "ms-MY";
      rec.interimResults = false;
      rec.onresult = (e) => resolve(e.results[0][0].transcript);
      rec.onerror = (e) => reject(new Error(e.error || "Suara tak dapat dikenal pasti."));
      rec.onend = () => resolve("");
      rec.start();
    });
  }

  /* ---------- Phase 3: keys, second brain, phone access ---------- */

  async function secretStatus() {
    if (!Asbab) return { claude: false, github: false, backup: false };
    return Asbab.secretStatus();
  }
  // Saving an empty value deletes the key. The key itself is never read back into the UI.
  const secretSet = (name, value) => Asbab ? Asbab.secretSet({ name, value }) : Promise.reject(new Error("Hanya dalam app Android."));
  const testClaude = (model) => Asbab ? Asbab.testClaude({ model }) : Promise.resolve({ ok: false, detail: "Hanya dalam app Android." });
  const testGithub = () => Asbab ? Asbab.testGithub() : Promise.resolve({ ok: false, detail: "Hanya dalam app Android." });

  // Streams Claude's answer; onText receives the text so far.
  async function claude({ system, prompt, model, maxTokens = 1200 }, onText) {
    if (!Asbab) throw new Error("Otak kedua hanya berfungsi dalam app Android.");
    const id = Math.random().toString(36).slice(2);
    const sub = await Asbab.addListener("claudeDelta", (e) => { if (e.id === id) onText?.(e.text); });
    try {
      return (await Asbab.claudeStream({ id, system, prompt, model, maxTokens })).text;
    } finally {
      sub.remove();
    }
  }

  const accessStatus = async () => (Asbab ? Asbab.accessStatus() : { browser: true });
  const setPaused = (paused) => Asbab?.setPaused({ paused });
  const serviceSync = () => Asbab?.serviceSync().catch(() => {});
  const ingestClear = () => Asbab?.ingestClear();

  window.Native = {
    github, secretStatus, secretSet, testClaude, testGithub, claude, accessStatus, setPaused, serviceSync, ingestClear,
    isNative, appInfo, openUrl, checkUpdate, releasesUrl: `https://github.com/${REPO}/releases`,
    openStore, prayerTimes, reschedule, status, requestNotifications, openSettings, testBilal, takeRoute,
    canListen, listen,
    onResume: (fn) => App?.addListener("resume", fn),
  };
})();
