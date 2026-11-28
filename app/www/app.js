// Asbab: app core (local API, routing, chat, in-app moon button).
// Ported from web-reference/public/app.js. The server API is replaced by LocalApi (on this phone).
const $ = (s, el = document) => el.querySelector(s);

// Pembina elemen ringkas. Teks pengguna dan AI sentiasa melalui textContent.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

// One set of line icons (icons.js, Phase 6).
const ICON = window.Icons;

const A = {
  boot: null,
  today: null,
  room: null,
  busy: false,
};
window.A = A;

const buzz = (ms = 12) => navigator.vibrate?.(ms);

/* ---------- API (local, on this phone) ---------- */
// A.api is created in start() once the installed app version is known.
const api = (...args) => A.api(...args);

// Second brain through the native router (keys never enter the web UI). weight "heavy" = the Coding role,
// anything else = the Chat role. Providers, models and fallback order come from Tetapan > Sambungan dan API.
// Resolves with the text (string, as before); thinkFull() also says which AI answered.
async function thinkFull({ system, prompt, weight = "light", role, maxTokens, prefer, parts, id }, onText) {
  return Native.ai({ role: role || (weight === "heavy" ? "coding" : "chat"), system, prompt, maxTokens, prefer, parts, id }, onText);
}
async function think(opts, onText) {
  return (await thinkFull(opts, onText)).text;
}
A.think = think;
A.thinkFull = thinkFull;

/* ---------- Top bar and left drawer (Phase 6) ---------- */
// Every page starts with: ☰ (drawer) · title · actions on the right.
function topbar(title, ...actions) {
  return h("div", { class: "topbar" },
    h("button", { class: "ikon-btn", "aria-label": "Buka menu", html: ICON.menu, onclick: openDrawer }),
    h("h1", {}, title), ...actions);
}
A.topbar = topbar;
// Phase 6.2: big heading with an optional small line under it and actions on the right (as in the preview).
function heading(title, sub, ...actions) {
  return h("div", { class: "salam-kepala" }, h("div", {}, h("h1", {}, title), sub ? h("div", { class: "kecil" }, sub) : null), ...actions);
}
A.heading = heading;

function openDrawer() {
  if ($(".laci")) return;
  buzz(8);
  const [, page, id] = location.hash.replace(/^#/, "").split("/");
  const latar = h("div", { class: "laci-latar" });
  const close = () => { laci.classList.remove("buka"); latar.classList.remove("buka"); setTimeout(() => { laci.remove(); latar.remove(); }, 300); };
  latar.onclick = close;
  const go = (hash) => (e) => { e.preventDefault(); close(); location.hash = hash; };
  const rooms = A.boot.rooms.filter((r) => !r.project).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  const COL = { kod: "#63e6be", biasa: "#b197fc" };
  const projects = (A.boot.projects || []).filter((p) => !p.archived);
  const laci = h("nav", { class: "laci", "aria-label": "Menu Asbab" },
    h("strong", { class: "tajuk-laci" }, "Chat"),
    h("button", { class: "baru", onclick: async () => {
      close();
      const name = prompt("Nama chat baru?");
      if (!name) return;
      const { room } = await api("rooms", { method: "POST", body: { name } });
      A.boot.rooms.push(room);
      location.hash = `#/chat/${room.id}`;
    } }, "+ Chat baru"),
    ...rooms.map((r) => h("a", { href: `#/chat/${r.id}`, class: page === "chat" && id === r.id ? "aktif" : "", onclick: go(`#/chat/${r.id}`) },
      h("span", { style: { flex: 1 } }, r.name), r.unread ? h("span", { class: "titik", style: { background: "var(--aksen)" } }) : null)),
    h("h4", {}, "Project"),
    ...projects.map((p) => h("a", { href: `#/project/${p.id}`, class: page === "project" && id === p.id ? "aktif" : "", onclick: go(`#/project/${p.id}`) },
      h("span", { class: "titik", style: { background: COL[p.type] || COL.biasa } }), h("span", { style: { flex: 1 } }, p.name),
      p.pending || p.status === "down" ? h("span", { class: "titik", style: { background: "#ff8787" } }) : null)),
    h("a", { href: "#/project", onclick: go("#/project") }, h("span", { class: "ikon", html: ICON.project }), "Semua project"),
    h("h4", {}, "Asbab"),
    h("a", { href: "#/tetapan", class: page === "tetapan" ? "aktif" : "", onclick: go("#/tetapan") }, h("span", { class: "ikon", html: ICON.tetapan }), "Tetapan"));
  document.body.append(latar, laci);
  requestAnimationFrame(() => { laci.classList.add("buka"); latar.classList.add("buka"); });
}
A.openDrawer = openDrawer;

/* ---------- Toast ("Disimpan", "Catatan dipadam" + Batal) ---------- */
function toast(text, { action, ms = 3500 } = {}) {
  document.querySelector(".toast")?.remove();
  const t = h("div", { class: "toast", role: "status" }, h("span", {}, text),
    action ? h("button", { class: "btn kecil", onclick: () => { t.remove(); action.fn(); } }, action.label) : null);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add("muncul"));
  setTimeout(() => { t.classList.remove("muncul"); setTimeout(() => t.remove(), 300); }, ms);
  return t;
}
A.toast = toast;

/* ---------- Bottom sheet ---------- */
function sheet(title, ...content) {
  document.querySelector(".sheet")?.remove();
  const close = () => s.remove();
  // A first item {sub: "..."} becomes the small grey line under the title.
  const sub = content[0] && content[0].sub ? content.shift().sub : null;
  const s = h("div", { class: "sheet stack", role: "dialog", "aria-label": title },
    h("div", { class: "kepala-sheet" }, h("div", {}, h("strong", {}, title), sub ? h("span", { class: "kecil" }, sub) : null),
      h("button", { class: "tutup-sheet", "aria-label": "Tutup", html: ICON.tutup, onclick: close })), ...content);
  s.close = close;
  document.body.append(s);
  return s;
}
A.sheet = sheet;

/* ---------- Which AI answers in this chat room (Phase 5.2) ---------- */
function aiPickerButton(room) {
  const name = () => (room.ai && Ai.byId(room.ai) ? Ai.byId(room.ai).label : "Auto");
  const DOT = { gemini: "#7fa8e8", openai: "#e8e8e8", claude: "#e3a77c" };
  const paintChip = () => btn.replaceChildren(h("b", { style: { background: DOT[room.ai] || "var(--aksen)" } }), name(), h("span", { class: "turun" }, "▾"));
  const btn = h("button", { class: "cip ai-pilih", "aria-label": "Pilih otak kedua untuk chat ini", onclick: async () => {
    const keys = await Native.secretStatus();
    const active = Ai.active(A.boot.settings, keys);
    const pick = async (id) => {
      await api(`rooms/${room.id}`, { method: "PATCH", body: { ai: id } });
      room.ai = Ai.byId(id) ? id : "auto";
      paintChip();
      s.close();
      toast(`Chat ini guna ${name()}`);
    };
    const row = (id, label, note) => h("button", { class: `pilihan${(room.ai || "auto") === id ? " dipilih" : ""}`, onclick: () => pick(id) },
      h("span", { class: "isi-pilihan" }, h("strong", {}, label), note ? h("span", { class: "muted" }, note) : null), h("span", { class: "tanda" }, "✓"));
    const s = sheet("Otak kedua untuk chat ini", { sub: "Hanya AI yang aktif dipaparkan" },
      row("auto", "Auto", "ikut susunan sandaran: " + (Ai.active(A.boot.settings, keys).map((id) => Ai.byId(id).label).join(" → ") || "tiada penyedia aktif")),
      ...active.map((id) => row(id, Ai.byId(id).label, id === "gemini" ? "kalau gagal, cuba penyedia lain" : null)),
      active.length ? null : h("p", { class: "muted" }, "Belum ada penyedia yang hidup dan ada key. Tetapkan dalam Tetapan > Sambungan dan API."));
  } });
  paintChip();
  return btn;
}

/* ---------- Start ---------- */
async function start() {
  A.version = (await Native.appInfo()).version;
  A.api = LocalApi.createLocalApi({
    store: await Native.openStore(), version: A.version,
    prayerTimes: Native.prayerTimes, onChange: () => { Native.reschedule(); Native.serviceSync(); Native.workSync(); },
    secrets: Native.secretStatus, githubRequest: Native.github,
  });
  A.boot = await A.api("bootstrap");
  Theme.apply();
  document.body.classList.toggle("ringan", A.boot.settings.animations === "ringan");
  $("#app").hidden = false;
  buildNav();
  buildMoon();
  refreshToday();
  const asked = await Native.takeRoute();
  if (asked.route) location.hash = asked.route;
  else if (!location.hash) location.hash = "#/chat/utama";
  else route();
  if (asked.text) setTimeout(() => sendMessage("utama", asked.text), 700);
  Native.reschedule();
  Native.serviceSync();
  Native.workSync();
  firstRunPermissions();
  Native.onResume(async () => {
    const r = await Native.takeRoute();
    if (r.route && r.route !== location.hash) location.hash = r.route;
    else poll();
    if (r.text) setTimeout(() => sendMessage("utama", r.text), 700);
    Native.reschedule();
  });
  setInterval(poll, 45000);
  setInterval(refreshToday, 5 * 60000);
  if (A.boot.settings.sound) Ambient.start();
}

async function refreshToday() {
  try {
    A.today = await api("today");
    Scene.setPeriod(Scene.periodFrom(A.today.prayer));
  } catch { Scene.setPeriod(Scene.periodFrom(null)); }
  try { Scene.setRain((await api("weather")).rain); } catch { /* abaikan */ }
}

async function poll() {
  try {
    const b = await api("bootstrap");
    A.boot = b;
    updateMoonState();
    paintRoomStrip();
    if (A.room) {
      const d = await api(`rooms/${A.room}`);
      const box = $("#msgs");
      if (box && d.messages.length !== Number(box.dataset.count || 0)) renderMessages(d.messages, true);
    }
  } catch { /* cuba lagi nanti */ }
}

/* ---------- Navigasi ---------- */
const NAV = [["chat", "Chat", "#/chat/utama"], ["hari", "Hari Ini", "#/hari-ini"], ["project", "Project", "#/project"], ["catatan", "Catatan", "#/catatan"], ["tetapan", "Tetapan", "#/tetapan"]];

function buildNav() {
  const nav = $("nav.bar");
  nav.replaceChildren(...NAV.map(([id, label, href]) =>
    h("a", { href, "data-id": id, html: `${ICON[id]}<span>${label}</span>` })));
}

function route() {
  if (!A.boot) return;
  const [, page, id, sub, extra] = location.hash.replace(/^#/, "").split("/");
  const navId = { chat: "chat", "hari-ini": "hari", project: "project", catatan: "catatan", tetapan: "tetapan" }[page] || "chat";
  document.querySelectorAll("nav.bar a").forEach((a) => a.classList.toggle("aktif", a.dataset.id === navId));
  Native.rememberRoute(location.hash);
  const section = { chat: "chat", "hari-ini": "hari", project: "project", catatan: "catatan" }[page] || "semua";
  const alam = Theme.apply(section);
  Scene.sky(alam && page === "project");
  closeRail();
  // Leaving the chat: no fixed chat bar, and Android's back gesture gets the left edge again.
  if (document.body.classList.contains("di-chat")) { document.body.classList.remove("di-chat"); Native.edgeSwipe(false); }
  const view = $("#view");
  view.onscroll = null;
  view.replaceChildren();
  view.scrollTop = 0;
  A.room = null;
  if (page === "hari-ini") return Views.today(view);
  if (page === "project" && id) return Views.project(view, id);
  if (page === "project") return Views.orbit(view);
  if (page === "catatan") return Views.notes(view, id, sub, extra);
  if (page === "tetapan") return Views.settings(view, id);
  return renderChat(view, id || "utama");
}
addEventListener("hashchange", route);

/* ---------- Chat (Phase 6.2: fixed glass bar, keyboard, attachments, long press, stop) ---------- */
const DRAF = (room) => `asbab:draf:${room}`;
const atBottom = () => { const v = $("#view"); return !v || v.scrollHeight - v.scrollTop - v.clientHeight < 80; };
const toBottom = (smooth) => { const v = $("#view"); if (v) v.scrollTo({ top: v.scrollHeight, behavior: smooth ? "smooth" : "auto" }); };

async function renderChat(view, roomId, opts = {}) {
  A.room = roomId;
  const room = A.boot.rooms.find((r) => r.id === roomId);
  if (!room) { location.hash = "#/chat/utama"; return; }
  Scene.setScene(room.scene || "kampung");
  const wrap = h("div", { class: "wrap" });
  if (!opts.embedded) {
    document.body.classList.add("di-chat");
    const more = room.id !== "utama" ? h("button", { class: "ikon-btn", "aria-label": "Pilihan chat", html: ICON.edit, onclick: () => {
      const s = sheet(room.name,
        h("button", { class: "pilihan", onclick: async () => {
          s.close();
          const name = prompt("Nama baharu?", room.name);
          if (!name) return;
          await api(`rooms/${room.id}`, { method: "PATCH", body: { name } });
          room.name = name; toast("Disimpan"); route();
        } }, h("strong", {}, "Tukar nama")),
        h("button", { class: "pilihan", onclick: async () => {
          s.close();
          if (!confirm(`Padam chat "${room.name}" dan semua mesejnya?`)) return;
          await api(`rooms/${room.id}`, { method: "DELETE" });
          A.boot.rooms = A.boot.rooms.filter((r) => r.id !== room.id);
          localStorage.removeItem(DRAF(room.id));
          toast("Chat dipadam");
          location.hash = "#/chat/utama";
        } }, h("strong", { style: { color: "var(--bahaya)" } }, "Padam chat")));
    } }) : null;
    // Thin glass bar that stays at the top while the messages scroll.
    view.append(h("div", { class: "chat-atas-tetap" }, h("div", { class: "topbar chat-atas" },
      h("button", { class: "ikon-btn", "aria-label": "Buka menu", html: ICON.menu, onclick: openDrawer }),
      h("strong", {}, room.id === "utama" ? "Asbab" : room.name), more, aiPickerButton(room))));
    Native.edgeSwipe(true);
  }
  // Links in answers open outside Asbab (Chrome Custom Tab).
  wrap.append(h("div", { id: "msgs", class: "msgs", "aria-live": "polite", onclick: (e) => {
    const a = e.target.closest("a[data-url]");
    if (a) { e.preventDefault(); Native.openUrl(a.dataset.url); }
  } }));
  (opts.into || view).append(wrap);
  if (!opts.embedded) {
    paintRoomStrip();
    const ask = (t) => () => { if (A.room) sendMessage(A.room, t); };
    view.append(h("div", { class: "cadangan", "aria-label": "Cadangan" },
      ...[["Waktu solat", "waktu solat"], ["Jadual esok", "jadual esok"], ["Belanja hari ni", "belanja hari ni"], ["Apa kau boleh buat?", "tolong"]]
        .map(([label, t]) => h("button", { onclick: ask(t) }, label))));
    // "↓" back to the newest message after scrolling up.
    const turun = h("button", { class: "ke-bawah", "aria-label": "Ke mesej terkini", html: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>', onclick: () => toBottom(true) });
    view.append(turun);
    view.onscroll = () => { turun.classList.toggle("nampak", !atBottom() && view.scrollHeight - view.scrollTop - view.clientHeight > 240); Scene.leaf(); };
    edgeSwipeToDrawer(view);
  } else view.onscroll = () => Scene.leaf();
  view.append(composer(roomId, opts.onSend));
  layoutChat();
  const d = await api(`rooms/${roomId}`);
  const r = A.boot.rooms.find((x) => x.id === roomId);
  if (r) r.unread = 0;
  updateMoonState();
  renderMessages(d.messages);
}
A.renderChat = renderChat;

// Swipe from the left edge of the screen opens the drawer.
function edgeSwipeToDrawer(view) {
  let x0 = -1, y0 = 0;
  view.addEventListener("touchstart", (e) => { const t = e.touches[0]; x0 = t.clientX < 28 ? t.clientX : -1; y0 = t.clientY; }, { passive: true });
  view.addEventListener("touchmove", (e) => {
    if (x0 < 0) return;
    const t = e.touches[0];
    if (Math.abs(t.clientY - y0) > 40) { x0 = -1; return; }
    if (t.clientX - x0 > 60) { x0 = -1; openDrawer(); }
  }, { passive: true });
}

// Where the composer sits: 8px above the bottom bar, or right above the keyboard when it is open.
// The bar's real height is measured so nothing overlaps on any screen size.
function layoutChat() {
  const r = document.documentElement.style;
  const nav = $("nav.bar");
  if (nav && getComputedStyle(nav).display !== "none") r.setProperty("--nav-ruang", Math.round(innerHeight - nav.getBoundingClientRect().top) + "px");
  const c = $(".composer");
  if (c) r.setProperty("--composer-h", Math.round(c.getBoundingClientRect().height) + "px");
}
addEventListener("resize", () => { const stay = atBottom(); layoutChat(); if (stay) toBottom(); });

/* Keyboard: the Android side reports exactly how much of the screen the keyboard covers (MainActivity);
   in a browser, visualViewport is used. Open = bottom bar hidden, composer right above the keyboard. */
const kb = { native: false, open: false };
function setKeyboard(open, px) {
  const stay = atBottom();
  kb.open = open;
  document.body.classList.toggle("papan-kekunci", open);
  document.documentElement.style.setProperty("--kb", (open ? px : 0) + "px");
  requestAnimationFrame(() => { layoutChat(); if (stay) toBottom(); });
}
window.asbabKeyboard = (open, px) => { kb.native = true; setKeyboard(!!open, Number(px) || 0); };
(function keyboardWatch() {
  const vv = window.visualViewport;
  if (!vv) return;
  let base = window.innerHeight;
  const update = () => {
    if (kb.native) return;
    if (window.innerHeight > base) base = window.innerHeight;
    const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    setKeyboard(base - vv.height > 150 || hidden > 150, hidden);
  };
  vv.addEventListener("resize", update);
  addEventListener("orientationchange", () => { base = 0; setTimeout(update, 300); });
})();

function paintRoomStrip() {
  // Phase 6: chat rooms live in the left drawer; this keeps an old strip (if any) up to date.
  const strip = $("#rooms");
  if (!strip) return;
  const list = A.boot.rooms.filter((r) => !r.project).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  strip.replaceChildren(...list.map((r) => h("a", { href: `#/chat/${r.id}`, class: r.id === A.room ? "aktif" : "" }, r.name)));
}

// "Hari ini", "Semalam" or "Jumaat, 27 November".
function dayLabel(ts) {
  const d = new Date(ts), t = new Date();
  const key = (x) => x.toDateString();
  if (key(d) === key(t)) return "Hari ini";
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (key(d) === key(y)) return "Semalam";
  return `${Core.hariOf(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10))}, ${d.toLocaleDateString("ms-MY", { day: "numeric", month: "long", ...(d.getFullYear() !== t.getFullYear() ? { year: "numeric" } : {}) })}`;
}

let msgList = [];
function renderMessages(list, animateLast = false) {
  const box = $("#msgs");
  if (!box) return;
  msgList = list.slice();
  box.dataset.count = list.length;
  const out = [];
  let last = "";
  list.forEach((m, i) => {
    const day = m.ts ? new Date(m.ts).toDateString() : last;
    if (m.ts && day !== last) { out.push(h("div", { class: "pemisah-tarikh" }, h("span", {}, dayLabel(m.ts)))); last = day; }
    out.push(msgEl(m, animateLast && i === list.length - 1));
  });
  box.replaceChildren(...out);
  if (!list.length) {
    box.append(h("div", { class: "chat-kosong" },
      h("h2", {}, `Assalamualaikum, ${A.boot.settings.name}.`),
      h("p", { class: "muted" }, "Apa yang aku boleh bantu? Cadangan di bawah dijawab tanpa AI.")));
  }
  toBottom();
}
// New message at the end: adds a date line first when the day changed.
function appendMsg(box, m, fresh) {
  if (!box) return null;
  const prev = msgList[msgList.length - 1];
  if (m.ts && (!prev || !prev.ts || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString())) box.append(h("div", { class: "pemisah-tarikh" }, h("span", {}, dayLabel(m.ts))));
  msgList.push(m);
  box.querySelector(".chat-kosong")?.remove();
  const el = msgEl(m, fresh);
  box.append(el);
  return el;
}

// Asbab's answers are shown with formatting (bold, lists, links); text is escaped first (markdown.js).
function paintText(el, m) {
  if (m.role === "user") el.textContent = m.text || "";
  else el.innerHTML = Markdown.toHtml(m.text || "");
}

function msgEl(m, fresh = false) {
  const meta = [];
  if (m.role === "asbab" && m.ai) meta.push(Ai.label(m));
  if (m.role === "asbab" && m.ai === false) meta.push("otak sendiri");
  if (m.saved) meta.push(`${m.saved} disimpan ke Catatan`);
  if (m.proactive) meta.push("Asbab mulakan");
  if (m.stopped) meta.push("dihentikan");
  const isi = h("div", { class: "isi-msg" });
  paintText(isi, m);
  const el = h("div", { class: `msg ${m.role === "user" ? "user" : "asbab"}${fresh ? (m.role === "user" ? " baru-user" : " baru-asbab") : ""}` },
    m.files && m.files.length ? filesEl(m.files) : null,
    m.text ? isi : null,
    m.note ? h("div", { class: "nota-msg" }, m.note) : null,
    h("div", { class: "meta" }, ...meta.map((x) => h("span", {}, x)), m.ts ? h("span", {}, new Date(m.ts).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })) : null));
  if (m.links && m.links.length) {
    el.append(h("div", { class: "msg-pautan" }, ...m.links.map((l) => h("button", { class: "aksi", onclick: () => { location.hash = l.hash; } }, l.label))));
  }
  longPress(el, () => msgMenu(m));
  if (fresh && m.role !== "user" && !document.body.classList.contains("ringan")) setTimeout(() => Scene.fireflies(el, 12), 30);
  return el;
}

// Thumbnails of attachments in a message (loaded from the phone's own storage).
function filesEl(files) {
  return h("div", { class: "lampiran-msg" }, ...files.map((f) => {
    const box = f.kind === "image" || f.kind === "video"
      ? h("div", { class: `lampiran-gambar${f.kind === "video" ? " video" : ""}`, "aria-label": f.name })
      : h("div", { class: "lampiran-fail" }, h("span", { html: ICON.catatan }), h("span", {}, f.name || f.kind));
    if (f.kind === "image" || f.kind === "video") Native.attachGet(f.id + ".thumb").then((t) => { if (t) box.style.backgroundImage = `url("data:image/jpeg;base64,${t}")`; });
    return box;
  }));
}

// Press and hold (about half a second, without moving).
function longPress(el, fn) {
  let t = null, x = 0, y = 0;
  el.addEventListener("pointerdown", (e) => { if (e.target.closest("a, button")) return; x = e.clientX; y = e.clientY; t = setTimeout(() => { t = null; buzz(15); fn(); }, 500); });
  const cancel = () => { if (t) clearTimeout(t); t = null; };
  el.addEventListener("pointermove", (e) => { if (Math.abs(e.clientX - x) + Math.abs(e.clientY - y) > 10) cancel(); });
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

function msgMenu(m) {
  const plain = m.role === "user" ? m.text || "" : Markdown.toPlain(m.text || "");
  const row = (label, fn, extra) => h("button", { class: "pilihan", onclick: () => { s.close(); fn(); } }, h("strong", extra || {}, label));
  const s = sheet(m.role === "user" ? "Mesej kau" : "Jawapan Asbab",
    plain ? row("Salin", async () => { await Native.copyText(plain); toast("Disalin"); }) : null,
    plain ? row("Kongsi", () => Native.shareText(plain).catch(() => {})) : null,
    plain ? row("Simpan ke Catatan", async () => {
      const today = Core.nowMY().date;
      await api("notes", { method: "POST", body: { kind: "nota", title: plain.split("\n")[0].slice(0, 60), text: plain, date: today } });
      toast("Disimpan ke Catatan");
    }) : null,
    m.role !== "user" ? row("Cuba lagi", () => retry(m)) : null);
}

// "Cuba lagi": ask again with the message Amin sent before this answer (attachments included).
function retry(m) {
  const i = msgList.findIndex((x) => x === m || (m.id && x.id === m.id));
  const before = msgList.slice(0, i < 0 ? msgList.length : i).reverse().find((x) => x.role === "user");
  if (!before) return toast("Tiada mesej untuk dicuba lagi.");
  if (A.busy) return toast("Tunggu jawapan sekarang habis dulu.");
  sendMessage(A.room, before.text || "", { allowAI: true, skipUser: true, files: before.files || [] });
}

function constellation(big) {
  const n = big ? 7 : 5;
  const pts = Array.from({ length: n }, (_, i) => [8 + (i * (big ? 150 : 100)) / (n - 1), 10 + Math.random() * (big ? 46 : 32)]);
  return h("div", { class: `buruj${big ? " otak2" : ""}`, "aria-label": big ? "Asbab sedang berfikir dengan otak kedua" : "Asbab sedang berfikir" },
    h("div", { html: `<svg>${pts.slice(1).map((p, i) => `<line x1="${pts[i][0] + 2}" y1="${pts[i][1] + 2}" x2="${p[0] + 2}" y2="${p[1] + 2}" style="animation-delay:${i * 0.25}s"/>`).join("")}</svg>` }),
    ...pts.map(([x, y], i) => h("span", { style: { left: x + "px", top: y + "px", animationDelay: i * 0.2 + "s" } })),
    big ? h("div", { class: "bulan2" }) : null);
}

/* ---------- Attachments (Phase 6.2) ---------- */
const LIMIT = { pdf: 10 * 1024 * 1024, video: 18 * 1024 * 1024, text: 200 * 1024 };
const TEXT_DOC = /\.(txt|md|csv|json|log)$/i;
const b64 = (dataUrl) => String(dataUrl).split(",")[1] || "";
const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("Fail tak dapat dibaca.")); r.readAsDataURL(file); });
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Gambar tak dapat dibaca.")); i.src = src; });
function drawJpeg(src, w, h0, max, q) {
  const k = Math.min(1, max / Math.max(w, h0));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h0 * k));
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}
// Pictures are shrunk (longest side 1600px, then smaller until under about 1.2 MB) to save cost and data.
async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    let max = 1600, q = 0.82, out = drawJpeg(img, img.naturalWidth, img.naturalHeight, max, q);
    while (out.length * 0.75 > 1.2 * 1024 * 1024 && max > 640) { max = Math.round(max * 0.8); q = Math.max(0.6, q - 0.06); out = drawJpeg(img, img.naturalWidth, img.naturalHeight, max, q); }
    return { data: b64(out), thumb: b64(drawJpeg(img, img.naturalWidth, img.naturalHeight, 240, 0.7)) };
  } finally { URL.revokeObjectURL(url); }
}
// A few still pictures from a video, for providers that cannot watch video.
async function videoFrames(file, count = 4) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("Video tak dapat dibaca.")); setTimeout(res, 6000); });
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
    const frames = [];
    for (let i = 0; i < count; i++) {
      v.currentTime = Math.min(dur - 0.05, (dur * (i + 0.5)) / count);
      await new Promise((res) => { v.onseeked = res; setTimeout(res, 3000); });
      frames.push(b64(drawJpeg(v, v.videoWidth || 640, v.videoHeight || 360, 768, 0.72)));
    }
    return frames;
  } finally { URL.revokeObjectURL(url); }
}
// Reads a picked file into {id, name, mime, kind, size, data, thumb, frames, text}. Throws a Malay message.
async function readAttachment(file) {
  const id = Core.uid();
  const name = (file.name || "lampiran").slice(0, 80);
  const mime = file.type || (TEXT_DOC.test(name) ? "text/plain" : "");
  if (/^image\//.test(mime)) {
    const { data, thumb } = await compressImage(file);
    return { id, name, mime: "image/jpeg", kind: "image", size: Math.round(data.length * 0.75), data, thumb };
  }
  if (/^video\//.test(mime)) {
    const frames = await videoFrames(file).catch(() => []);
    const big = file.size > LIMIT.video;
    if (big && !frames.length) throw new Error("Video terlalu besar (had 18 MB). Potong video dulu.");
    return { id, name, mime, kind: "video", size: file.size, data: big ? null : b64(await fileToDataUrl(file)), frames, thumb: frames[0] || null };
  }
  if (mime === "application/pdf") {
    if (file.size > LIMIT.pdf) throw new Error("PDF terlalu besar (had 10 MB).");
    return { id, name, mime, kind: "pdf", size: file.size, data: b64(await fileToDataUrl(file)) };
  }
  if (/^text\//.test(mime) || TEXT_DOC.test(name)) {
    if (file.size > LIMIT.text) throw new Error("Dokumen teks terlalu besar (had 200 KB).");
    return { id, name, mime: "text/plain", kind: "text", size: file.size, text: await file.text() };
  }
  throw new Error("Jenis fail ini belum disokong. Guna gambar, video, PDF atau dokumen teks (.txt, .md, .csv).");
}

// Saves attachments on the phone only, so "Cuba lagi" can send them again. Never part of the GitHub backup.
const attachCache = new Map();
async function keepAttachment(a) {
  attachCache.set(a.id, a);
  const put = (k, v) => (v ? Native.attachPut(k, v).catch(() => {}) : null);
  await Promise.all([put(a.id, a.data || a.text || null), put(a.id + ".thumb", a.thumb), ...(a.frames || []).map((f, i) => put(`${a.id}.f${i}`, f))]);
}
async function loadAttachment(meta) {
  if (attachCache.has(meta.id)) return attachCache.get(meta.id);
  const a = { ...meta, data: null, frames: [] };
  const main = await Native.attachGet(meta.id);
  if (meta.kind === "text") a.text = main || ""; else a.data = main;
  if (meta.kind === "video") for (let i = 0; i < 4; i++) { const f = await Native.attachGet(`${meta.id}.f${i}`); if (f) a.frames.push(f); }
  return a;
}

/* ---------- Composer: + attachments · text · mic · send/stop ---------- */
function composer(roomId, onSend) {
  const pending = [];
  const draftKey = DRAF(roomId);
  // A normal <textarea> with every keyboard helper on (see capacitor.config.json for why suggestions were missing).
  const ta = h("textarea", { rows: 1, placeholder: "Cakap dengan Asbab…", "aria-label": "Mesej", spellcheck: "true", autocorrect: "on", autocapitalize: "sentences", autocomplete: "on", enterkeyhint: "enter", onkeydown: (e) => {
    if (e.key === "Enter" && !e.shiftKey && innerWidth > 700) { e.preventDefault(); send(); }
  }, oninput: () => { grow(); localStorage.setItem(draftKey, ta.value); state(); } });
  ta.value = localStorage.getItem(draftKey) || "";
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; layoutChat(); };
  const tray = h("div", { class: "lampiran-tray" });
  const paintTray = () => {
    tray.replaceChildren(...pending.map((a) => h("div", { class: `lampiran-pra${a.kind === "image" || a.kind === "video" ? " gambar" : ""}`, style: a.thumb ? { backgroundImage: `url("data:image/jpeg;base64,${a.thumb}")` } : {} },
      a.thumb ? (a.kind === "video" ? h("span", { class: "main-ikon" }, "▶") : null) : h("span", { class: "nama" }, a.name),
      h("button", { class: "buang", "aria-label": `Buang ${a.name}`, onclick: () => { pending.splice(pending.indexOf(a), 1); paintTray(); state(); } }, "×"))));
    tray.hidden = !pending.length;
    layoutChat();
  };
  const addFiles = async (files) => {
    for (const f of [...files].slice(0, 6 - pending.length)) {
      try { pending.push(await readAttachment(f)); } catch (e) { toast(e.message, { ms: 5000 }); }
    }
    paintTray(); state();
  };
  const picker = (accept, capture) => {
    const inp = h("input", { type: "file", accept, hidden: true, multiple: !capture, ...(capture ? { capture: "environment" } : {}), onchange: () => { addFiles(inp.files); inp.remove(); } });
    document.body.append(inp);
    inp.click();
  };
  const plus = h("button", { class: "icon-btn tambah", "aria-label": "Lampiran", html: ICON.plus, onclick: () => {
    const s = sheet("Lampiran", { sub: "Dihantar hanya bila kau tekan hantar" },
      h("button", { class: "pilihan", onclick: () => { s.close(); picker("image/*", true); } }, h("span", { class: "ikon-pilihan", html: ICON.kamera }), h("strong", {}, "Kamera")),
      h("button", { class: "pilihan", onclick: () => { s.close(); picker("image/*,video/*"); } }, h("span", { class: "ikon-pilihan", html: ICON.gambar }), h("strong", {}, "Galeri"), h("span", { class: "muted" }, "gambar dan video")),
      h("button", { class: "pilihan", onclick: () => { s.close(); picker("application/pdf,text/plain,text/markdown,text/csv,.txt,.md,.csv,.json"); } }, h("span", { class: "ikon-pilihan", html: ICON.catatan }), h("strong", {}, "Fail"), h("span", { class: "muted" }, "PDF dan dokumen teks")));
  } });
  const sendBtn = h("button", { class: "icon-btn send", "aria-label": "Hantar", html: ICON.send, onclick: () => (A.stopping ? A.stopping() : send()) });
  const state = () => {
    const streaming = !!A.stopping;
    sendBtn.classList.toggle("henti", streaming);
    sendBtn.innerHTML = streaming ? '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/></svg>' : ICON.send;
    sendBtn.setAttribute("aria-label", streaming ? "Berhenti" : "Hantar");
    sendBtn.disabled = !streaming && !ta.value.trim() && !pending.length;
  };
  const send = async () => {
    const text = ta.value.trim();
    if ((!text && !pending.length) || A.busy) return;
    const files = pending.splice(0);
    ta.value = ""; localStorage.removeItem(draftKey); grow(); paintTray();
    buzz();
    if (onSend && !files.length && (await onSend(text))) return state();
    await sendMessage(roomId, text, { attachments: files });
  };
  const mic = voiceButton((t) => { ta.value = (ta.value + " " + t).trim(); localStorage.setItem(draftKey, ta.value); grow(); state(); ta.focus(); });
  const el = h("div", { class: "composer" }, tray, h("div", { class: "baris-taip" }, plus, ta, mic, sendBtn));
  el.refresh = state;
  tray.hidden = true;
  setTimeout(() => { grow(); state(); }, 0);
  return el;
}
const composerState = () => $(".composer")?.refresh?.();

function voiceButton(onText) {
  if (!Native.canListen) return null;
  const btn = h("button", { class: "icon-btn mic", "aria-label": "Cakap guna suara", html: ICON.mic, onclick: async () => {
    if (btn.classList.contains("rakam")) return;
    btn.classList.add("rakam");
    buzz();
    try {
      const text = await Native.listen();
      if (text) onText(text);
    } catch (e) {
      alert(e.message || "Suara tak dapat dikenal pasti.");
    } finally {
      btn.classList.remove("rakam");
    }
  } });
  return btn;
}

async function firstRunPermissions() {
  if (!Native.isNative || localStorage.getItem("asbab:askedNotif")) return;
  localStorage.setItem("asbab:askedNotif", "1");
  const st = await Native.status();
  if (st.notifications) return;
  const ok = confirm("Asbab perlu kebenaran notifikasi untuk Mod Bilal, peringatan jadual dan taklimat pagi. Benarkan sekarang?");
  if (ok) await Native.requestNotifications();
}

// Gemini (free tier) may use what is sent to improve Google's products: a small warning before pictures or files.
function geminiWarning() {
  if (localStorage.getItem("asbab:amaranGemini") === "0") return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const end = (v) => { if (done) return; done = true; s.close(); resolve(v); };
    const s = sheet("Hantar kepada Gemini?", { sub: "Tier percuma" },
      h("p", { class: "kecil" }, Ai.byId("gemini").privacy),
      h("div", { class: "row" },
        h("button", { class: "btn utama", onclick: () => end(true) }, "Hantar"),
        h("button", { class: "btn", onclick: () => end(false) }, "Batal"),
        h("button", { class: "btn kecil", onclick: () => { localStorage.setItem("asbab:amaranGemini", "0"); end(true); } }, "Jangan tanya lagi")));
    const close0 = s.close;
    s.close = () => { close0(); if (!done) { done = true; resolve(false); } };
    s.querySelector(".tutup-sheet").onclick = () => s.close();
  });
}

// Which provider will read the attachments, and how video goes: Gemini watches video, others get frames.
function planParts(atts, room) {
  const s = A.boot.settings;
  const keys = A.boot.aiKeys || {};
  const used = A.boot.usage?.by || {};
  const prefer = room?.ai && room.ai !== "auto" ? room.ai : "";
  const media = atts.filter((a) => a.kind !== "text");
  const hasVideo = media.some((a) => a.kind === "video");
  let kinds = [...new Set(media.map((a) => a.kind))];
  let plan = Ai.chainFor(s, "chat", { keys, used, prefer }, kinds);
  let asFrames = false, note = "";
  if (hasVideo) {
    if (plan.ids[0] === "gemini") { if (plan.switchedFrom) note = `Video dihantar kepada Gemini (${Ai.byId(plan.switchedFrom).label} tak dapat menonton video).`; }
    else {
      asFrames = true;
      kinds = [...new Set(media.map((a) => (a.kind === "video" ? "image" : a.kind)))];
      plan = Ai.chainFor(s, "chat", { keys, used, prefer }, kinds);
      if (plan.ids[0]) note = `Video dihantar sebagai ${media.filter((a) => a.kind === "video").reduce((n, a) => n + (a.frames || []).length, 0)} bingkai gambar kepada ${Ai.byId(plan.ids[0]).label}.`;
    }
  } else if (plan.switchedFrom && plan.ids[0]) note = `${Ai.byId(plan.switchedFrom).label} tak dapat membaca lampiran ini, jadi ${Ai.byId(plan.ids[0]).label} digunakan.`;
  const parts = [];
  for (const a of media) {
    if (a.kind === "video" && asFrames) (a.frames || []).forEach((f, i) => parts.push({ mime: "image/jpeg", data: f, name: `${a.name}-bingkai${i + 1}.jpg` }));
    else if (a.data) parts.push({ mime: a.mime, data: a.data, name: a.name });
  }
  return { provider: plan.ids[0] || null, prefer: hasVideo && plan.ids[0] ? plan.ids[0] : (plan.switchedFrom && plan.ids[0] ? plan.ids[0] : null), parts, note };
}

async function sendMessage(roomId, text, { allowAI = false, skipUser = false, attachments = [], files = [] } = {}) {
  const box = $("#msgs");
  const room = A.boot.rooms.find((r) => r.id === roomId);
  A.busy = true;
  composerState();
  // "Cuba lagi" passes the saved attachments of the earlier message.
  let atts = attachments;
  if (!atts.length && files.length) atts = await Promise.all(files.map(loadAttachment));
  const meta = atts.map(({ id, name, mime, kind, size }) => ({ id, name, mime, kind, size }));
  let receipt = null;
  try {
    if (attachments.length) await Promise.all(attachments.map(keepAttachment));
    // Own brain for receipts: read the photo on the phone (no AI) when it is one picture.
    const imgs = atts.filter((a) => a.kind === "image");
    if (imgs.length === 1 && atts.length === 1 && (!text || /resit|receipt|belanja|rekod|bayar/i.test(text))) {
      const r = await Native.ocr(imgs[0].data).catch(() => ({ ok: false }));
      const total = r.ok ? Money.receiptTotal(r.text) : null;
      if (total) receipt = { total, shop: Money.receiptShop(r.text) };
    }
    // Before anything leaves the phone: which provider gets the attachments (warn for Gemini free tier).
    const media = atts.filter((a) => a.kind !== "text");
    let plan = null;
    if (media.length && !receipt) {
      plan = planParts(atts, room);
      if (plan.provider === "gemini" && !(await geminiWarning())) {
        A.busy = false; composerState();
        toast("Tak dihantar.");
        return;
      }
    }
    if (!skipUser && box) { appendMsg(box, { role: "user", text, files: meta, ts: Date.now() }, true); toBottom(true); }
    const thinking = constellation(false);
    box?.append(thinking);
    const docText = atts.filter((a) => a.kind === "text").map((a) => `--- ${a.name} ---\n${a.text || ""}`).join("\n\n");
    let d;
    try {
      d = await api("chat", { method: "POST", body: { roomId, text, allowAI, skipUser, files: meta, receipt, docText } });
    } finally { thinking.remove(); }
    if (d.messages) {
      for (const m of d.messages) appendMsg(box, m, true);
      if (d.navigate) {
        const b = await api("bootstrap"); A.boot = b;
        setTimeout(() => (location.hash = d.navigate), 900);
      }
    } else if (d.askAI) {
      box?.append(h("div", { class: "ask-ai kad" },
        h("p", {}, "Soalan ni perlukan otak kedua. Teruskan?"),
        h("div", { class: "row" },
          h("button", { class: "btn utama", onclick: (e) => { e.target.closest(".ask-ai").remove(); sendMessage(roomId, text, { allowAI: true, skipUser: true, attachments: atts }); } }, "Guna otak kedua"),
          h("button", { class: "btn", onclick: (e) => e.target.closest(".ask-ai").remove() }, "Tak payah"))));
    } else if (d.needAI) {
      const big = constellation(true);
      box?.append(big);
      const live = h("div", { class: "msg asbab" }, h("div", { class: "isi-msg" }));
      let started = false, partial = "", stopped = false;
      const id = Core.uid();
      A.stopping = () => { stopped = true; Native.aiStop(id); buzz(20); };
      composerState();
      if (!plan && media.length) plan = planParts(atts, room);
      let answer;
      try {
        answer = await thinkFull({ ...d.context, role: d.role || "chat", prefer: plan?.prefer || d.prefer, parts: plan?.parts, id }, (t) => {
          partial = t;
          if (!t) return;
          if (!started) { big.remove(); box?.append(live); started = true; }
          const stay = atBottom();
          live.firstChild.innerHTML = Markdown.toHtml(t.split("<<NOTA>>")[0]);
          if (stay) toBottom();
        });
      } catch (err) {
        big.remove(); live.remove();
        if (stopped && partial) answer = { text: partial, provider: "", fallback: false };
        else if (stopped) { toast("Dihentikan."); return; }
        else {
          // Every provider failed or is out of quota: the own brain answers and explains simply.
          const fb = await api("chat/fallback", { method: "POST", body: { roomId, text: err.message } });
          appendMsg(box, fb.message, true);
          return;
        }
      }
      big.remove();
      if (!answer.text) { live.remove(); toast("Dihentikan."); return; }
      const note = [plan?.note && !answer.note ? plan.note : "", answer.note || ""].filter(Boolean).join(" ");
      const fin = await api("chat/finish", { method: "POST", body: { roomId, text: answer.text, provider: answer.provider, fallback: answer.fallback, note, stopped } });
      live.remove();
      appendMsg(box, fin.message, true);
      A.boot.usage = fin.usage || A.boot.usage;
      updateMoonState();
    }
  } catch (e) {
    box?.querySelectorAll(".buruj").forEach((x) => x.remove());
    appendMsg(box, { role: "asbab", text: `Ada masalah: ${e.message}`, ai: false, ts: Date.now() });
  } finally {
    A.busy = false;
    A.stopping = null;
    composerState();
    const n = box?.querySelectorAll(".msg").length;
    if (box) box.dataset.count = n;
    toBottom(true);
  }
}
A.sendMessage = sendMessage;

/* ---------- Butang bulan ---------- */
let moon;      // the .gel button (moon + menu that grows out of it)
let moonList;  // .senarai-g
let moonDim;   // .gelap-g
let rail = null; // true while the menu is open (name kept from Phase 4)
const MOON_ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="13" fill="rgba(255,255,255,.12)"/><path d="M20 7a13 13 0 1 0 0 26a10 13 0 1 1 0-26z" fill="#f3ead2"/></svg>';
const GEL = 60;

// Phase 6.2: the moon is one glass button with a turning colour ring. Tapping it makes the button itself
// grow into a column of round buttons (as in the preview); tapping again folds it back in reverse order.
function buildMoon() {
  moonDim = h("div", { class: "gelap-g", onclick: () => closeRail() });
  moonList = h("div", { class: "senarai-g", role: "menu" });
  const face = h("button", { class: "bulan-g", "aria-label": "Asbab: buka menu pantas", html: MOON_ICON });
  moon = h("div", { class: "gel", id: "gel" }, moonList, face);
  document.body.append(moonDim, moon);
  if (localStorage.getItem("asbab:moonOff") === "1") moon.style.display = "none";
  const saved = JSON.parse(localStorage.getItem("asbab:moon") || "null") || { x: innerWidth - 72, y: innerHeight * 0.52, tidur: false };
  let x = saved.x, y = saved.y, vx = 0, vy = 0, drag = false, moved = 0, lastX = 0, lastY = 0, lastT = 0;
  const place = () => { moon.style.left = x + "px"; moon.style.top = y + "px"; };
  const clamp = () => { x = Math.max(6, Math.min(innerWidth - GEL - 6, x)); y = Math.max(10, Math.min(innerHeight - GEL - 10, y)); };
  moon.classList.toggle("tidur", saved.tidur);
  clamp(); place();
  moon.home = () => { clamp(); place(); };
  moon.at = () => ({ x, y });

  face.addEventListener("pointerdown", (e) => {
    if (rail) return;
    drag = true; moved = 0; lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    face.setPointerCapture(e.pointerId);
    moon.classList.add("seret");
  });
  face.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const now = performance.now(), dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    x += dx; y += dy;
    vx = dx / Math.max(1, now - lastT) * 16; vy = dy / Math.max(1, now - lastT) * 16;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
    clamp(); place();
  });
  face.addEventListener("pointerup", () => {
    if (rail) return closeRail();
    if (!drag) return;
    drag = false;
    if (moved < 8) {
      moon.classList.remove("seret");
      if (moon.classList.contains("tidur")) { moon.classList.remove("tidur"); save(false); return; }
      return toggleRail();
    }
    if (y > innerHeight - 110) { moon.classList.remove("seret"); moon.classList.add("tidur"); buzz(20); y = innerHeight - GEL - 10; place(); return save(true); }
    // Fling, then snap to the nearest side.
    const edge = x + GEL / 2 < innerWidth / 2 ? 12 : innerWidth - GEL - 12;
    const step = () => {
      vx *= 0.9; vy *= 0.9;
      x += vx + (edge - x) * 0.12; y += vy;
      if (y < 60 || y > innerHeight - 150) vy = -vy * 0.5;
      clamp(); place();
      if (Math.abs(edge - x) > 0.5 || Math.abs(vy) > 0.3) requestAnimationFrame(step);
      else { x = edge; y = Math.max(60, Math.min(innerHeight - 150, y)); place(); moon.classList.remove("seret"); save(false); buzz(8); }
    };
    requestAnimationFrame(step);
  });
  face.addEventListener("pointercancel", () => { drag = false; moon.classList.remove("seret"); });
  const save = (tidur) => localStorage.setItem("asbab:moon", JSON.stringify({ x, y, tidur }));
  addEventListener("resize", () => { if (!rail) { clamp(); place(); } });
  updateMoonState();
}

function updateMoonState() {
  if (!moon || !A.boot) return;
  const unread = A.boot.rooms.some((r) => r.unread && r.id !== A.room);
  const urgent = A.boot.projects.some((p) => p.status === "down" || p.pending);
  moon.classList.toggle("bernafas", unread && !urgent);
  moon.classList.toggle("penting", urgent);
}
A.updateMoonState = updateMoonState;

let moonUp = false;
// Folds back in reverse order: the last button goes first, then the glass shrinks into the moon.
function closeRail() {
  if (!rail || !moon) return;
  rail = null;
  const kids = [...moonList.children], n = kids.length;
  kids.forEach((c, i) => { c.style.transitionDelay = (moonUp ? i : n - i) * 16 + "ms"; });
  moon.classList.remove("buka");
  moonDim.classList.remove("buka");
  moon.style.height = GEL + "px";
  moon.querySelector(".bulan-g").style.top = "0px";
  moon.home();
  setTimeout(() => { if (!rail) moonList.replaceChildren(); }, 520);
}

function toggleRail() {
  if (rail) return closeRail();
  buzz(10);
  const [, page] = location.hash.replace(/^#/, "").split("/");
  const here = { chat: "chat", "hari-ini": "hari", project: "project", catatan: "catatan", tetapan: "tetapan" }[page] || "chat";
  const go = (hash) => (e) => { e.stopPropagation(); closeRail(); setTimeout(() => { location.hash = hash; }, 250); };
  const items = [];
  items.push(h("button", { "aria-label": "Arahan pantas", html: ICON.mic, onclick: (e) => { e.stopPropagation(); closeRail(); setTimeout(quickSheet, 250); } }));
  for (const [id, label, href] of NAV.slice(0, 4)) items.push(h("button", { "aria-label": label, class: here === id ? "kini" : "", html: ICON[id], onclick: go(href) }));
  items.push(h("span", { class: "garis-g" }));
  const COL = { kod: "#6fc2b0", biasa: "#a99be0" };
  for (const p of (A.boot.projects || []).filter((x) => !x.archived).slice(-3).reverse())
    items.push(h("button", { class: "titik", "aria-label": `Project ${p.name}`, onclick: go(`#/project/${p.id}`) }, h("i", { style: { background: COL[p.type] || COL.biasa } }), p.pending || p.status === "down" ? h("b") : null));
  const used = A.boot.usage?.count || 0, cap = Ai.totalCap(A.boot.settings || {}, A.boot.aiKeys || {}) || 1;
  const f = Math.min(1, used / cap), C = 2 * Math.PI * 15;
  items.push(h("button", { class: "cincin-guna", "aria-label": `Otak kedua: ${used} daripada ${cap} hari ini`, onclick: go("#/tetapan/otak"), html: `<svg viewBox="0 0 40 40" style="stroke:none"><circle cx="20" cy="20" r="15" stroke="rgba(255,255,255,.15)" stroke-width="3" fill="none"/><circle cx="20" cy="20" r="15" stroke="var(--aksen)" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 20 20)"/><text x="20" y="24" text-anchor="middle" font-size="11" fill="currentColor">${used}</text></svg>` }));
  items.push(h("button", { class: here === "tetapan" ? "kini" : "", "aria-label": "Tetapan", html: ICON.tetapan, onclick: go("#/tetapan") }));
  moonList.replaceChildren(...items);

  // Height: 60 for the moon + 50 per round button, 8 per divider line.
  const full = GEL + items.reduce((a, el) => a + (el.classList.contains("garis-g") ? 8 : 50), 0) + 2;
  const r = moon.getBoundingClientRect();
  moonUp = r.top > innerHeight / 2;
  const n = items.length;
  items.forEach((c, i) => { c.style.transitionDelay = (moonUp ? n - i : i) * 28 + "ms"; });
  moonList.style.top = moonUp ? "8px" : "62px";
  moon.querySelector(".bulan-g").style.top = moonUp ? full - GEL + "px" : "0px";
  let top = moonUp ? r.top - (full - GEL) : r.top;
  top = Math.max(8, Math.min(innerHeight - full - 8, top));
  rail = true;
  // Next frame so the height and the buttons animate from the closed state.
  requestAnimationFrame(() => {
    moon.style.top = top + "px";
    moon.style.height = full + "px";
    moon.classList.add("buka");
    moonDim.classList.add("buka");
  });
}

function quickSheet() {
  if ($(".sheet")) return;
  buzz();
  const close = () => sheet.remove();
  const quick = (label, text) => h("button", { class: "btn", onclick: async () => { close(); location.hash = "#/chat/utama"; setTimeout(() => sendMessage("utama", text), 600); } }, label);
  const ta = h("textarea", { rows: 2, placeholder: "Arahan untuk Asbab…", "aria-label": "Arahan pantas" });
  const sheet = h("div", { class: "sheet stack", role: "dialog", "aria-label": "Arahan pantas Asbab" },
    h("div", { class: "kepala-sheet" }, h("div", {}, h("strong", {}, "Asbab"), h("span", { class: "kecil" }, "Arahan pantas")),
      h("button", { class: "tutup-sheet", "aria-label": "Tutup", html: ICON.tutup, onclick: close })),
    h("div", { class: "row" }, voiceButton((t) => { ta.value = (ta.value + " " + t).trim(); }), ta),
    h("div", { class: "row" },
      h("button", { class: "btn utama", onclick: () => {
        const t = ta.value.trim(); if (!t) return;
        close(); location.hash = "#/chat/utama"; setTimeout(() => sendMessage("utama", t), 600);
      } }, "Hantar"),
      quick("Waktu solat", "waktu solat"), quick("Jadual esok", "jadual esok"), quick("Belanja hari ni", "belanja hari ni"),
      h("label", { class: "btn" }, "Snap makanan", h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onchange: (e) => {
        const f = e.target.files[0]; if (!f) return;
        const what = prompt("Kau makan apa?");
        if (what) { close(); location.hash = "#/chat/utama"; setTimeout(() => sendMessage("utama", `makan: ${what}`), 600); }
      } }))));
  document.body.append(sheet);
  ta.focus();
}

/* ---------- Bunyi alam ---------- */
const Ambient = {
  ctx: null,
  start() {
    if (this.ctx) return;
    const start = () => {
      removeEventListener("pointerdown", start);
      const ctx = new AudioContext();
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
      const gain = ctx.createGain(); gain.gain.value = 0.18;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.1;
      lfo.connect(lfoGain).connect(gain.gain);
      src.connect(lp).connect(gain).connect(ctx.destination);
      src.start(); lfo.start();
      this.ctx = ctx;
    };
    addEventListener("pointerdown", start, { once: true });
  },
  stop() { this.ctx?.close(); this.ctx = null; },
};
A.Ambient = Ambient;

/* ---------- Boot ---------- */
Scene.build();
Scene.setPeriod(Scene.periodFrom(null));
start().catch((e) => {
  document.body.append(h("div", { class: "panel err", style: { position: "fixed", inset: "auto 16px 40% 16px", zIndex: 60 } }, `Asbab gagal dibuka: ${e.message}`));
});
