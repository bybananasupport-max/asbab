// Thin wrapper around Capacitor native plugins.
// Everything here also works (with safe fallbacks) when the UI is opened in a normal browser.
(function () {
  const cap = window.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const plugin = (name) => (isNative && cap.registerPlugin ? cap.registerPlugin(name) : null);
  const App = plugin("App");
  const Browser = plugin("Browser");

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

  window.Native = { isNative, appInfo, openUrl, checkUpdate, releasesUrl: `https://github.com/${REPO}/releases` };
})();
