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

  // Ask GitHub for the newest release and compare with the installed version.
  // token is optional (needed while the repo is private; stored safely from Phase 3).
  async function checkUpdate(token = "") {
    const info = await appInfo();
    const headers = { accept: "application/vnd.github+json" };
    if (token) headers.authorization = `Bearer ${token}`;
    let r;
    try {
      r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers, cache: "no-store" });
    } catch {
      return { ok: false, current: info.version, message: "Tak dapat hubungi GitHub. Semak internet dan cuba lagi." };
    }
    if (r.status === 404 || r.status === 401 || r.status === 403) {
      return {
        ok: false, current: info.version, needToken: !token,
        message: token
          ? "GitHub tolak token ni, atau belum ada Release lagi."
          : "Repo Asbab private, jadi semakan automatik perlukan token GitHub (akan dipasang dalam Fasa 3). Buka halaman Release untuk semak sendiri.",
      };
    }
    if (!r.ok) return { ok: false, current: info.version, message: `GitHub membalas ralat ${r.status}.` };
    return { ok: true, ...Core.updateInfo(info.version, await r.json()) };
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

  window.Native = {
    isNative, appInfo, openUrl, checkUpdate, releasesUrl: `https://github.com/${REPO}/releases`,
    openStore, prayerTimes, reschedule, status, requestNotifications, openSettings, testBilal, takeRoute,
    canListen, listen,
    onResume: (fn) => App?.addListener("resume", fn),
  };
})();
