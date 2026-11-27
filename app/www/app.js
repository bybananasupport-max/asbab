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
// anything else = the Chat role. Providers, models and fallback order come from Tetapan > Sambungan & API.
// Resolves with the text (string, as before); thinkFull() also says which AI answered.
async function thinkFull({ system, prompt, weight = "light", role, maxTokens, prefer }, onText) {
  return Native.ai({ role: role || (weight === "heavy" ? "coding" : "chat"), system, prompt, maxTokens, prefer }, onText);
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
    h("h4", {}, "Chat"),
    ...rooms.map((r) => h("a", { href: `#/chat/${r.id}`, class: page === "chat" && id === r.id ? "aktif" : "", onclick: go(`#/chat/${r.id}`) },
      h("span", { class: "ikon", html: ICON.chat }), h("span", { style: { flex: 1 } }, r.name), r.unread ? h("span", { class: "titik", style: { background: "var(--aksen)" } }) : null)),
    h("button", { class: "item", onclick: async () => {
      close();
      const name = prompt("Nama chat baru?");
      if (!name) return;
      const { room } = await api("rooms", { method: "POST", body: { name } });
      A.boot.rooms.push(room);
      location.hash = `#/chat/${room.id}`;
    } }, h("span", { class: "ikon", html: ICON.plus }), "Chat baru"),
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
  const s = h("div", { class: "sheet stack", role: "dialog", "aria-label": title },
    h("div", { class: "row" }, h("h3", { style: { flex: 1 } }, title), h("button", { class: "btn", onclick: close }, "Tutup")), ...content);
  s.close = close;
  document.body.append(s);
  return s;
}
A.sheet = sheet;

/* ---------- Which AI answers in this chat room (Phase 5.2) ---------- */
function aiPickerButton(room) {
  const name = () => (room.ai && Ai.byId(room.ai) ? Ai.byId(room.ai).label : "Auto");
  const btn = h("button", { class: "btn ai-pilih", "aria-label": "Pilih otak kedua untuk chat ini", onclick: async () => {
    const keys = await Native.secretStatus();
    const active = Ai.active(A.boot.settings, keys);
    const pick = async (id) => {
      await api(`rooms/${room.id}`, { method: "PATCH", body: { ai: id } });
      room.ai = Ai.byId(id) ? id : "auto";
      btn.textContent = `Otak: ${name()}`;
      s.close();
      toast(`Chat ini guna ${name()}`);
    };
    const row = (id, label, note) => h("button", { class: `pilihan${(room.ai || "auto") === id ? " dipilih" : ""}`, onclick: () => pick(id) },
      h("strong", {}, label), note ? h("span", { class: "muted" }, note) : null);
    const s = sheet("Otak kedua untuk chat ini",
      row("auto", "Auto (ikut susunan sandaran)", Ai.active(A.boot.settings, keys).map((id) => Ai.byId(id).label).join(" → ") || "Tiada penyedia aktif"),
      ...active.map((id) => row(id, Ai.byId(id).label, "Kalau gagal, Asbab cuba penyedia lain ikut susunan sandaran.")),
      active.length ? null : h("p", { class: "muted" }, "Belum ada penyedia yang hidup dan ada key. Tetapkan dalam Tetapan > Sambungan & API."));
  } }, `Otak: ${name()}`);
  return btn;
}

/* ---------- Keyboard: hide the bottom bar, only the composer rises (Phase 5.2) ---------- */
(function keyboardWatch() {
  const vv = window.visualViewport;
  if (!vv) return;
  let base = window.innerHeight;
  const update = () => {
    if (window.innerHeight > base) base = window.innerHeight;
    const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const open = base - vv.height > 150;
    document.body.classList.toggle("papan-kekunci", open);
    document.documentElement.style.setProperty("--kb", hidden + "px");
  };
  vv.addEventListener("resize", update);
  addEventListener("orientationchange", () => { base = 0; setTimeout(update, 300); });
})();

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
  const [, page, id, sub] = location.hash.replace(/^#/, "").split("/");
  const navId = { chat: "chat", "hari-ini": "hari", project: "project", catatan: "catatan", tetapan: "tetapan" }[page] || "chat";
  document.querySelectorAll("nav.bar a").forEach((a) => a.classList.toggle("aktif", a.dataset.id === navId));
  Native.rememberRoute(location.hash);
  const section = { chat: "chat", "hari-ini": "hari", project: "project", catatan: "catatan" }[page] || "semua";
  const alam = Theme.apply(section);
  Scene.sky(alam && page === "project");
  closeRail();
  const view = $("#view");
  view.replaceChildren();
  view.scrollTop = 0;
  A.room = null;
  if (page === "hari-ini") return Views.today(view);
  if (page === "project" && id) return Views.project(view, id);
  if (page === "project") return Views.orbit(view);
  if (page === "catatan") return Views.notes(view, id, sub);
  if (page === "tetapan") return Views.settings(view, id);
  return renderChat(view, id || "utama");
}
addEventListener("hashchange", route);

/* ---------- Chat ---------- */
function paintRoomStrip() {
  // Phase 6: chat rooms live in the left drawer; this keeps an old strip (if any) up to date.
  const strip = $("#rooms");
  if (!strip) return;
  const list = A.boot.rooms.filter((r) => !r.project).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  strip.replaceChildren(
    ...list.map((r) => h("a", { href: `#/chat/${r.id}`, class: r.id === A.room ? "aktif" : "" }, r.name, r.unread && r.id !== A.room ? h("span", { class: "dot" }) : null)),
    h("a", { href: "#", "aria-label": "Chat baru", onclick: async (e) => {
      e.preventDefault();
      const name = prompt("Nama bilik chat baru?");
      if (!name) return;
      const { room } = await api("rooms", { method: "POST", body: { name } });
      A.boot.rooms.push(room);
      location.hash = `#/chat/${room.id}`;
    } }, "+ Baru"));
}

async function renderChat(view, roomId, opts = {}) {
  A.room = roomId;
  const room = A.boot.rooms.find((r) => r.id === roomId);
  if (!room) { location.hash = "#/chat/utama"; return; }
  Scene.setScene(room.scene || "kampung");
  const wrap = h("div", { class: "wrap" });
  if (!opts.embedded) {
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
          toast("Chat dipadam");
          location.hash = "#/chat/utama";
        } }, h("strong", { style: { color: "#ff8787" } }, "Padam chat")));
    } }) : null;
    wrap.append(topbar(room.name, aiPickerButton(room), more));
  }
  wrap.append(h("div", { id: "msgs", class: "msgs", "aria-live": "polite" }));
  (opts.into || view).append(wrap);
  if (!opts.embedded) paintRoomStrip();
  view.append(composer(roomId, opts.onSend));
  view.onscroll = () => Scene.leaf();
  const d = await api(`rooms/${roomId}`);
  const r = A.boot.rooms.find((x) => x.id === roomId);
  if (r) r.unread = 0;
  updateMoonState();
  renderMessages(d.messages);
}
A.renderChat = renderChat;

function renderMessages(list, animateLast = false) {
  const box = $("#msgs");
  if (!box) return;
  box.dataset.count = list.length;
  box.replaceChildren(...list.map((m, i) => msgEl(m, animateLast && i === list.length - 1)));
  if (!list.length) {
    // Empty chat: a greeting and quick suggestions (Phase 6).
    const ask = (t) => () => { const room = A.room; if (room) sendMessage(room, t); };
    box.append(h("div", { class: "chat-kosong" },
      h("h2", {}, `Assalamualaikum, ${A.boot.settings.name}.`),
      h("p", { class: "muted" }, "Apa yang aku boleh bantu? Perkara di bawah dijawab tanpa AI."),
      h("div", { class: "cadangan-chat" },
        ...[["Waktu solat", "waktu solat"], ["Jadual esok", "jadual esok"], ["Belanja hari ni", "belanja hari ni"], ["Apa kau boleh buat?", "tolong"]]
          .map(([label, t]) => h("button", { onclick: ask(t) }, label)))));
  }
  $("#view").scrollTop = 1e9;
}

function msgEl(m, fresh = false) {
  const meta = [];
  if (m.role === "asbab" && m.ai) meta.push(Ai.label(m));
  if (m.role === "asbab" && m.ai === false) meta.push("otak sendiri");
  if (m.saved) meta.push(`${m.saved} disimpan ke Catatan`);
  if (m.proactive) meta.push("Asbab mulakan");
  const el = h("div", { class: `msg ${m.role === "user" ? "user" : "asbab"}${fresh ? (m.role === "user" ? " baru-user" : " baru-asbab") : ""}` },
    m.text,
    meta.length || m.ts ? h("div", { class: "meta" }, m.ts ? new Date(m.ts).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" }) : "", ...meta.map((x) => h("span", {}, x))) : null);
  if (m.links && m.links.length) {
    el.append(h("div", { class: "msg-pautan" }, ...m.links.map((l) => h("button", { class: "btn kecil", onclick: () => { location.hash = l.hash; } }, l.label))));
  }
  if (fresh && m.role !== "user" && !document.body.classList.contains("ringan")) setTimeout(() => Scene.fireflies(el, 12), 30);
  return el;
}

function constellation(big) {
  const n = big ? 7 : 5;
  const pts = Array.from({ length: n }, (_, i) => [8 + (i * (big ? 150 : 100)) / (n - 1), 10 + Math.random() * (big ? 46 : 32)]);
  return h("div", { class: `buruj${big ? " otak2" : ""}`, "aria-label": big ? "Asbab sedang berfikir dengan otak kedua" : "Asbab sedang berfikir" },
    h("div", { html: `<svg>${pts.slice(1).map((p, i) => `<line x1="${pts[i][0] + 2}" y1="${pts[i][1] + 2}" x2="${p[0] + 2}" y2="${p[1] + 2}" style="animation-delay:${i * 0.25}s"/>`).join("")}</svg>` }),
    ...pts.map(([x, y], i) => h("span", { style: { left: x + "px", top: y + "px", animationDelay: i * 0.2 + "s" } })),
    big ? h("div", { class: "bulan2" }) : null);
}

function composer(roomId, onSend) {
  // Keyboard suggestions on (Phase 5.2): spellcheck, autocorrect, sentence capitals, autocomplete.
  const ta = h("textarea", { rows: 1, placeholder: "Cakap dengan Asbab…", "aria-label": "Mesej", spellcheck: "true", autocorrect: "on", autocapitalize: "sentences", autocomplete: "on", enterkeyhint: "send", onkeydown: (e) => {
    if (e.key === "Enter" && !e.shiftKey && innerWidth > 700) { e.preventDefault(); send(); }
  }, oninput: () => { ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; } });
  const send = async () => {
    const text = ta.value.trim();
    if (!text || A.busy) return;
    ta.value = ""; ta.style.height = "auto";
    buzz();
    if (onSend && (await onSend(text))) return;
    await sendMessage(roomId, text);
  };
  const mic = voiceButton((t) => { ta.value = (ta.value + " " + t).trim(); ta.focus(); });
  return h("div", { class: "composer" }, mic, ta, h("button", { class: "icon-btn send", "aria-label": "Hantar", html: ICON.send, onclick: send }));
}

function voiceButton(onText) {
  if (!Native.canListen) return null;
  const btn = h("button", { class: "icon-btn", "aria-label": "Cakap guna suara", html: ICON.mic, onclick: async () => {
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

// First launch on Android 13+: ask once for notification permission, explaining why.
async function firstRunPermissions() {
  if (!Native.isNative || localStorage.getItem("asbab:askedNotif")) return;
  localStorage.setItem("asbab:askedNotif", "1");
  const st = await Native.status();
  if (st.notifications) return;
  const ok = confirm("Asbab perlu kebenaran notifikasi untuk Mod Bilal, peringatan jadual dan taklimat pagi. Benarkan sekarang?");
  if (ok) await Native.requestNotifications();
}

async function sendMessage(roomId, text, { allowAI = false, skipUser = false } = {}) {
  const box = $("#msgs");
  A.busy = true;
  if (!skipUser && box) { box.querySelector(":scope > p.muted")?.remove(); box.append(msgEl({ role: "user", text, ts: Date.now() }, true)); $("#view").scrollTop = 1e9; }
  const thinking = constellation(false);
  box?.append(thinking);
  try {
    const d = await api("chat", { method: "POST", body: { roomId, text, allowAI, skipUser } });
    thinking.remove();
    if (d.messages) {
      for (const m of d.messages) box?.append(msgEl(m, true));
      if (d.navigate) {
        const b = await api("bootstrap"); A.boot = b;
        setTimeout(() => (location.hash = d.navigate), 900);
      }
    } else if (d.askAI) {
      box?.append(h("div", { class: "ask-ai panel row" },
        h("span", {}, "Soalan ni perlukan otak kedua (Claude). Teruskan?"),
        h("button", { class: "btn utama", onclick: (e) => { e.target.closest(".ask-ai").remove(); sendMessage(roomId, text, { allowAI: true, skipUser: true }); } }, "Guna Claude"),
        h("button", { class: "btn", onclick: (e) => e.target.closest(".ask-ai").remove() }, "Tak payah")));
    } else if (d.needAI) {
      const big = constellation(true);
      box?.append(big);
      const live = h("div", { class: "msg asbab" });
      let started = false;
      let answer;
      try {
        answer = await thinkFull({ ...d.context, role: d.role || "chat", prefer: d.prefer }, (t) => {
          if (!started) { big.remove(); box?.append(live); started = true; }
          live.textContent = t.split("<<NOTA>>")[0];
          $("#view").scrollTop = 1e9;
        });
      } catch (err) {
        // Every provider failed or is out of quota: the own brain answers and explains simply.
        big.remove(); live.remove();
        const fb = await api("chat/fallback", { method: "POST", body: { roomId, text: err.message } });
        box?.append(msgEl(fb.message, true));
        return;
      }
      big.remove();
      const fin = await api("chat/finish", { method: "POST", body: { roomId, text: answer.text, provider: answer.provider, fallback: answer.fallback } });
      live.replaceWith(msgEl(fin.message, true));
      A.boot.usage = fin.usage || A.boot.usage;
      updateMoonState();
    }
  } catch (e) {
    thinking.remove();
    box?.querySelectorAll(".buruj").forEach((x) => x.remove());
    box?.append(msgEl({ role: "asbab", text: `Ada masalah: ${e.message}`, ai: false }));
  } finally {
    A.busy = false;
    const n = box?.querySelectorAll(".msg").length;
    if (box) box.dataset.count = n;
    $("#view").scrollTop = 1e9;
  }
}
A.sendMessage = sendMessage;

/* ---------- Butang bulan ---------- */
let moon;
function buildMoon() {
  moon = h("button", { id: "moonbtn", "aria-label": "Asbab: buka arahan pantas", html: Scene.moonSVG(58) });
  document.body.append(moon);
  if (localStorage.getItem("asbab:moonOff") === "1") moon.style.display = "none";
  const saved = JSON.parse(localStorage.getItem("asbab:moon") || "null") || { x: innerWidth - 74, y: innerHeight * 0.55, tidur: false };
  let x = saved.x, y = saved.y, vx = 0, vy = 0, drag = false, moved = 0, lastX = 0, lastY = 0, lastT = 0;
  const place = () => { moon.style.left = x + "px"; moon.style.top = y + "px"; };
  const clamp = () => { x = Math.max(6, Math.min(innerWidth - 64, x)); y = Math.max(10, Math.min(innerHeight - 70, y)); };
  moon.classList.toggle("tidur", saved.tidur);
  clamp(); place();

  moon.addEventListener("pointerdown", (e) => {
    drag = true; moved = 0; lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    moon.setPointerCapture(e.pointerId);
  });
  moon.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const now = performance.now(), dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    x += dx; y += dy;
    vx = dx / Math.max(1, now - lastT) * 16; vy = dy / Math.max(1, now - lastT) * 16;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
    clamp(); place();
  });
  moon.addEventListener("pointerup", () => {
    drag = false;
    if (moved < 8) {
      if (moon.classList.contains("tidur")) { moon.classList.remove("tidur"); save(false); return; }
      return toggleRail();
    }
    if (y > innerHeight - 110) { moon.classList.add("tidur"); buzz(20); y = innerHeight - 70; place(); return save(true); }
    const edge = x + 29 < innerWidth / 2 ? 6 : innerWidth - 64;
    const step = () => {
      vx *= 0.9; vy *= 0.9;
      x += vx + (edge - x) * 0.12; y += vy;
      if (y < 10 || y > innerHeight - 70) vy = -vy * 0.5;
      clamp(); place();
      if (Math.abs(edge - x) > 0.5 || Math.abs(vy) > 0.3) requestAnimationFrame(step);
      else { x = edge; place(); save(false); buzz(8); }
    };
    requestAnimationFrame(step);
  });
  const save = (tidur) => localStorage.setItem("asbab:moon", JSON.stringify({ x, y, tidur }));
  addEventListener("resize", () => { clamp(); place(); });
  updateMoonState();
}

function updateMoonState() {
  if (!moon || !A.boot) return;
  const unread = A.boot.rooms.some((r) => r.unread && r.id !== A.room);
  const urgent = A.boot.projects.some((p) => p.status === "down" || p.pending);
  moon.classList.toggle("bernafas", unread && !urgent);
  moon.classList.toggle("penting", urgent);
  moon.innerHTML = Scene.moonSVG(58);
}
A.updateMoonState = updateMoonState;

/* ---------- Jalur bulan ---------- */
const RAIL_ICON = {
  suara: ICON.mic,
  tutup: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
let rail = null;
let railLatar = null;
// Closes in reverse order: the last icon goes first, then the rail folds back into the moon.
function closeRail() {
  if (!rail) return;
  const r = rail, latar = railLatar;
  rail = null; railLatar = null;
  removeEventListener("pointerdown", outside, true);
  const kids = [...r.children];
  kids.forEach((el, i) => { el.style.animationDelay = (kids.length - 1 - i) * 0.025 + "s"; });
  r.classList.add("tutup");
  latar?.classList.remove("buka");
  moon.classList.remove("buka");
  setTimeout(() => { r.remove(); latar?.remove(); moon.style.visibility = ""; }, 340);
}
function outside(e) { if (rail && !rail.contains(e.target)) closeRail(); }

function toggleRail() {
  if (rail) return closeRail();
  buzz();
  const r = moon.getBoundingClientRect();
  const up = r.top > innerHeight / 2;
  const [, page] = location.hash.replace(/^#/, "").split("/");
  const here = { chat: "chat", "hari-ini": "hari", project: "project", catatan: "catatan", tetapan: "tetapan" }[page] || "chat";
  const go = (hash) => () => { closeRail(); location.hash = hash; };
  const items = [];
  let delay = 0;
  const add = (el) => { el.style.animationDelay = (delay += 0.035) + "s"; items.push(el); };
  add(h("button", { class: "bulan-rail", "aria-label": "Tutup", html: Scene.moonSVG(40), onclick: closeRail, style: { background: "transparent", boxShadow: "none" } }));
  add(h("button", { "aria-label": "Arahan pantas", html: ICON.mic, onclick: () => { closeRail(); quickSheet(); } }));
  for (const [id, label, href] of NAV.slice(0, 4)) add(h("button", { "aria-label": label, class: here === id ? "aktif" : "", html: ICON[id], onclick: go(href) }));
  add(h("span", { class: "pemisah" }));
  const COL = { kod: "#6fc2b0", biasa: "#a99be0" };
  for (const p of (A.boot.projects || []).filter((x) => !x.archived).slice(-3).reverse())
    add(h("button", { class: "titik", "aria-label": `Project ${p.name}`, onclick: go(`#/project/${p.id}`) }, h("i", { style: { background: COL[p.type] || COL.biasa } }), p.pending || p.status === "down" ? h("b") : null));
  const used = A.boot.usage?.count || 0, cap = Ai.totalCap(A.boot.settings || {}, A.boot.aiKeys || {}) || 1;
  const f = Math.min(1, used / cap), C = 2 * Math.PI * 15;
  add(h("button", { class: "cincin-guna", "aria-label": `Otak kedua: ${used} daripada ${cap} hari ini`, onclick: go("#/tetapan/otak"), html: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" stroke="rgba(255,255,255,.15)" stroke-width="3" fill="none"/><circle cx="20" cy="20" r="15" stroke="var(--aksen-2)" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 20 20)"/><text x="20" y="24" text-anchor="middle" font-size="10" fill="currentColor" stroke="none">${used}</text></svg>` }));
  add(h("button", { class: `profil${here === "tetapan" ? " aktif" : ""}`, "aria-label": "Tetapan", onclick: go("#/tetapan") }, (A.boot.settings?.name || "A").slice(0, 1).toUpperCase()));

  rail = h("div", { class: `rail${up ? " ke-atas" : ""}`, role: "menu", "aria-label": "Menu Asbab" }, ...items);
  const left = Math.min(innerWidth - 70, Math.max(6, r.left - 3));
  Object.assign(rail.style, up ? { left: left + "px", bottom: innerHeight - r.bottom - 3 + "px" } : { left: left + "px", top: r.top - 3 + "px" });
  railLatar = h("div", { class: "rail-latar" });
  document.body.append(railLatar, rail);
  requestAnimationFrame(() => railLatar?.classList.add("buka"));
  moon.classList.add("buka");
  const rr = rail.getBoundingClientRect();
  if (rr.top < 8) Object.assign(rail.style, { top: "8px", bottom: "auto" });
  else if (rr.bottom > innerHeight - 8) Object.assign(rail.style, { top: "auto", bottom: "8px" });
  moon.style.visibility = "hidden";
  setTimeout(() => addEventListener("pointerdown", outside, true), 50);
}

function quickSheet() {
  if ($(".sheet")) return;
  buzz();
  const close = () => sheet.remove();
  const quick = (label, text) => h("button", { class: "btn", onclick: async () => { close(); location.hash = "#/chat/utama"; setTimeout(() => sendMessage("utama", text), 600); } }, label);
  const ta = h("textarea", { rows: 2, placeholder: "Arahan untuk Asbab…", "aria-label": "Arahan pantas" });
  const sheet = h("div", { class: "sheet stack", role: "dialog", "aria-label": "Arahan pantas Asbab" },
    h("div", { class: "row" }, h("h3", { style: { flex: 1 } }, "Asbab"), h("button", { class: "btn", onclick: close }, "Tutup")),
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
