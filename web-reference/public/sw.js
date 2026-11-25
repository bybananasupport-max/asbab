// Service worker Asbab: hanya untuk notifikasi.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: "Asbab", body: e.data?.text() || "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Asbab", {
    body: d.body || "", icon: "/icon.svg", badge: "/icon.svg", data: { url: d.url || "/" }, vibrate: [60, 40, 60],
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
