// Asbab: Hari Ini, Project, Catatan and Tetapan pages.
// Ported from web-reference/public/views.js; server-only parts are marked with the phase that brings them back.
(function () {
  const WAKTU = [["fajr", "Subuh"], ["dhuhr", "Zohor"], ["asr", "Asar"], ["maghrib", "Maghrib"], ["isha", "Isyak"]];
  const toMin = (s) => { const [a, b] = String(s || "0:0").split(":").map(Number); return a * 60 + (b || 0); };
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const rm = (n) => `RM${Number(n || 0).toFixed(2)}`;
  const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const buzz = (ms = 12) => navigator.vibrate?.(ms);
  const sheetForm = (title, fields, onSave) => {
    const form = h("form", { class: "sheet stack", onsubmit: async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      try { await onSave(data); form.remove(); } catch (err) { $(".err", form).textContent = err.message; }
    } },
      h("h3", {}, title), ...fields,
      h("p", { class: "err", role: "alert" }),
      h("div", { class: "row" }, h("button", { class: "btn utama", type: "submit" }, "Simpan"), h("button", { class: "btn", type: "button", onclick: () => form.remove() }, "Batal")));
    document.body.append(form);
    form.querySelector("input, textarea, select")?.focus();
  };
  const field = (label, name, attrs = {}) => h("label", { class: "f" }, label, attrs.tag === "select"
    ? h("select", { name }, ...attrs.options.map(([v, t]) => h("option", { value: v, selected: v === attrs.value }, t)))
    : attrs.tag === "textarea" ? h("textarea", { name, rows: attrs.rows || 4 }, attrs.value || "")
    : h("input", { name, type: attrs.type || "text", value: attrs.value ?? "", placeholder: attrs.placeholder || "", required: attrs.required, step: attrs.step }));

  /* ================= HARI INI ================= */
  // Hari Ini (Phase 6): greeting, countdown ring to the next prayer, next schedule with a live
  // countdown, two-column stat cards, week strip.
  async function today(view) {
    Scene.setScene("bukit");
    const wrap = h("div", { class: "wrap stack" }, A.heading("Hari Ini"),
      h("div", { class: "rangka", style: { height: "180px" } }), h("div", { class: "grid2" }, h("div", { class: "rangka", style: { height: "112px" } }), h("div", { class: "rangka", style: { height: "112px" } })));
    view.append(wrap);
    let t, all;
    try { [t, { notes: all }] = await Promise.all([A.api("today"), A.api("notes")]); A.today = t; }
    catch (e) { wrap.replaceChildren(A.heading("Hari Ini"), h("p", { class: "err" }, e.message)); return; }
    const pt = t.prayer;
    const hr = new Date().getHours();
    const salam = hr < 11 ? "Selamat pagi" : hr < 14 ? "Selamat tengah hari" : hr < 19 ? "Selamat petang" : "Selamat malam";
    const tarikh = new Date(t.now.date + "T12:00:00").toLocaleDateString("ms-MY", { day: "numeric", month: "long" });
    wrap.replaceChildren(
      A.heading(`${salam}, ${A.boot.settings.name}`, `${t.now.hari}, ${tarikh}${pt?.hijri ? " · " + pt.hijri : ""}`),
      pt ? h("div", { class: "kad", style: { padding: "0 0 12px" } }, solatRing(pt), h("div", { style: { padding: "0 14px" } }, solatGrid(t)))
        : h("div", { class: "kad" }, `Waktu solat JAKIM (zon ${A.boot.settings.zone}) belum dapat diambil. Semak internet, atau semak kod zon dalam Tetapan > Profil.`),
      h("div", { class: "label-seksyen" }, "Seterusnya"),
      nextScheduleCard(t, all),
      statGrid(t, all),
      weekCard(all, t.now.date));
    clearInterval(today.timer);
    today.timer = setInterval(() => {
      if (location.hash !== "#/hari-ini") return clearInterval(today.timer);
      const ring = $("#cincin-solat"); if (ring && pt) ring.replaceWith(solatRing(pt));
      tickCountdowns();
    }, 1000);
  }

  // Ring that fills from the previous prayer to the next one.
  function solatRing(pt) {
    const nx = nextPrayer(pt);
    const m = nowMin();
    const times = WAKTU.map(([k]) => toMin(pt[k]));
    const prev = [...times].reverse().find((x) => x <= m) ?? (times[4] - 1440);
    const span = Math.max(1, (nx.left + m) - prev);
    const f = Math.min(1, Math.max(0, (m - prev) / span));
    const R = 32, C = 2 * Math.PI * R;
    const lead = A.boot.settings.bilalLead;
    const left = nx.left >= 60 ? `${Math.floor(nx.left / 60)} jam ${nx.left % 60} minit` : `${nx.left} minit`;
    return h("div", { id: "cincin-solat", class: "hero-solat" },
      h("div", { class: "cincin-kecil", html: `<svg viewBox="0 0 78 78"><circle class="trek" cx="39" cy="39" r="${R}"/><circle class="isi" cx="39" cy="39" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}"/></svg>` }),
      h("div", {},
        h("div", { class: "kecil" }, nx.left <= lead ? "Mod Bilal: masa bersiap" : "Solat seterusnya"),
        h("span", { class: "besar" }, nx.n),
        h("div", { class: "kecil" }, `${nx.time} · lagi ${left}`),
        nx.left <= lead ? h("div", { class: "kecil" }, "Dah mandi dan ambil wuduk?") : null));
  }

  // The next schedule item today (or tomorrow) with a small live countdown in the bottom-right corner.
  function nextScheduleCard(t, all) {
    const now = new Date();
    const items = all.filter((n) => n.kind === "jadual" && n.time && n.date >= t.now.date)
      .map((n) => ({ n, at: new Date(`${n.date}T${n.time}:00`) })).filter((x) => x.at > now).sort((a, b) => a.at - b.at);
    const prayers = t.prayer ? WAKTU.map(([k, nama]) => ({ nama, time: t.prayer[k], at: new Date(`${t.now.date}T${t.prayer[k]}:00`) })).filter((x) => x.at > now) : [];
    const rows = [
      ...items.slice(0, 3).map((x) => ({ at: x.at, el: h("button", { class: "kad item kad-jadual", onclick: () => { location.hash = `#/catatan/jadual/${x.n.id}`; } },
        h("strong", {}, x.n.title), h("span", { class: "kecil" }, `${x.n.date === t.now.date ? "" : x.n.date + " · "}${x.n.time}${x.n.text && x.n.text !== x.n.title ? ", " + x.n.text.slice(0, 40) : ""}`),
        h("span", { class: "kira", "data-sampai": String(x.at.getTime()) }, countdown(x.at.getTime()))) })),
      ...prayers.slice(0, 2).map((x) => ({ at: x.at, el: h("div", { class: "kad item" },
        h("strong", {}, x.nama), h("span", { class: "kecil" }, x.time),
        h("span", { class: "kira", "data-sampai": String(x.at.getTime()) }, countdown(x.at.getTime()))) })),
    ].sort((a, b) => a.at - b.at).slice(0, 4);
    return h("div", { class: "senarai-seterusnya" }, ...rows.map((r) => r.el),
      items.length ? null : h("button", { class: "kad item", onclick: () => addJadual() }, h("strong", {}, "Tiada jadual akan datang"), h("span", { class: "kecil" }, "Tekan untuk tambah jadual")));
  }
  const pad2 = (n) => String(n).padStart(2, "0");
  function countdown(ms) {
    const d = Math.max(0, Math.floor((ms - Date.now()) / 1000));
    const hh = Math.floor(d / 3600) % 24;
    return `${d >= 86400 ? Math.floor(d / 86400) + "h " : ""}${d >= 3600 ? pad2(hh) + ":" : ""}${pad2(Math.floor(d / 60) % 60)}:${pad2(d % 60)}`;
  }
  function tickCountdowns() {
    document.querySelectorAll("[data-sampai]").forEach((el) => { el.textContent = countdown(Number(el.dataset.sampai)); });
  }

  function nextPrayer(pt) {
    const m = nowMin();
    for (const [k, n] of WAKTU) if (toMin(pt[k]) > m) return { k, n, time: pt[k], left: toMin(pt[k]) - m };
    const tm = A.today.prayerTomorrow || pt;
    return { k: "fajr", n: "Subuh esok", time: tm.fajr, left: 1440 - m + toMin(tm.fajr) };
  }

  function solatGrid(t) {
    return h("div", { class: "solat-list", role: "group", "aria-label": "Tanda solat" },
      ...WAKTU.map(([k, n]) => {
        const done = !!t.solat[k];
        const b = h("button", { class: `solat${done ? " selesai" : ""}`, "aria-pressed": done ? "true" : "false", onclick: async () => {
          const now = !b.classList.contains("selesai");
          b.classList.toggle("selesai", now);
          b.setAttribute("aria-pressed", String(now));
          if (now) { b.append(h("span", { class: "cahaya" })); buzz(30); }
          t.solat = (await A.api("solat", { method: "POST", body: { waktu: k, done: now } })).solat;
        } }, h("strong", {}, n), t.prayer[k]);
        return b;
      }));
  }

  const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  function spark(values) {
    const max = Math.max(1, ...values);
    const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${26 - (v / max) * 22}`);
    return `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts.join(" L")}"/></svg>`;
  }

  function addJadual(date) {
    sheetForm("Tambah jadual", [
      field("Apa", "title", { required: true, placeholder: "Kelas English Skills" }),
      field("Tarikh", "date", { type: "date", value: date || todayISO(), required: true }),
      field("Masa", "time", { type: "time" }),
    ], async (d) => { await A.api("notes", { method: "POST", body: { ...d, kind: "jadual" } }); A.toast("Disimpan"); route(); });
  }
  function addBelanja(amount, title) {
    sheetForm("Rekod belanja", [
      field("Jumlah (RM)", "amount", { type: "number", step: "0.01", required: true, value: amount ?? "" }),
      field("Untuk apa", "title", { required: true, placeholder: "Nasi lemak", value: title ?? "" }),
    ], async (d) => { const r = await A.api("notes", { method: "POST", body: { ...d, kind: "belanja", amount: Number(d.amount) } }); A.toast(r.budget || "Disimpan"); route(); });
  }

  // Two-column stat cards.
  function statGrid(t, all) {
    const used = A.boot.usage.count, cap = Ai.totalCap(A.boot.settings, A.boot.aiKeys || {});
    const sites = A.boot.projects.filter((p) => p.url && !p.archived);
    const down = sites.filter((p) => p.status === "down").length;
    const had = Number(A.boot.settings.belanjaHad?.harian) || 0;
    const card = (label, nilai, extra, onclick, frac) => h("button", { class: "kad kad-stat", onclick },
      h("span", { class: "label" }, label), h("span", { class: "nilai" }, nilai), extra ? h("span", { class: "label" }, extra) : null,
      frac != null ? h("span", { class: "bar" }, h("i", { style: { width: Math.min(100, frac * 100) + "%", background: frac >= 1 ? "#ff8787" : "" } })) : null);
    return h("div", { class: "grid2" },
      card("Belanja hari ini", rm(t.belanjaTotal), had ? `had ${rm(had)}` : null, addBelanja, had ? t.belanjaTotal / had : null),
      card("Otak kedua", cap ? `${used} / ${cap}` : `${used}`, cap ? null : "belum disambung", () => (location.hash = "#/tetapan/sambungan"), cap ? used / cap : null),
      card("Website", sites.length ? (down ? `${down} down` : "Semua ok") : "–", sites.length ? null : "Tambah dalam project", () => (location.hash = "#/project")),
      card("Solat hari ini", `${WAKTU.filter(([k]) => t.solat[k]).length} / 5`, null, () => $("#cincin-solat")?.scrollIntoView({ behavior: "smooth", block: "center" })));
  }

  function weekCard(all, todayDate) {
    const base = new Date(todayDate + "T00:00:00");
    const monday = new Date(base); monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
    const NAMA = ["Isn", "Sel", "Rab", "Kha", "Jum", "Sab", "Aha"];
    let sel = todayDate;
    const list = h("div", {});
    const paint = () => {
      const items = all.filter((n) => n.kind === "jadual" && n.date === sel).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      list.replaceChildren(...(items.length ? items.map((n) => h("div", { class: "note" }, h("span", { class: "jenis" }, n.time || "--:--"), h("span", { class: "tajuk" }, n.title)))
        : [h("p", { class: "muted" }, "Tiada jadual. Asbab tambah sendiri bila jumpa dalam perbualan.")]));
      strip.querySelectorAll("button").forEach((b) => b.classList.toggle("pilih", b.dataset.d === sel));
    };
    const strip = h("div", { class: "minggu", role: "tablist", "aria-label": "Minggu ini" }, ...days.map((d, i) => {
      const iso = isoDay(d);
      const ada = all.some((n) => n.kind === "jadual" && n.date === iso);
      return h("button", { "data-d": iso, class: iso === todayDate ? "hari-ini" : "", onclick: () => { sel = iso; paint(); buzz(6); } }, NAMA[i], h("strong", {}, d.getDate()), ada ? h("i") : null);
    }));
    paint();
    return h("div", { class: "kad stack" },
      h("div", { class: "row" }, h("h3", { style: { flex: 1 } }, "Minggu ini"), h("button", { class: "btn kecil", onclick: () => addJadual(sel) }, "Tambah")),
      strip, list);
  }

  /* ================= PROJECT: MEDAN GRAVITI ================= */
  const COLOR = { kod: "#6fc2b0", biasa: "#a99be0" };
  const still = () => document.body.classList.contains("ringan") || matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function orbit(view) {
    const { projects } = await A.api("projects");
    A.boot.projects = projects;
    const listMode = false; // Phase 7.1: the list is its own page (projectui.js); this page is the Medan Graviti view
    const wrap = h("div", { class: "wrap stack" },
      A.topbar("Project",
        h("button", { class: "cip", onclick: () => { localStorage.setItem("asbab:paparMedan", "0"); route(); } }, "Senarai"),
        h("button", { class: "cip", "aria-label": "Project baru", onclick: newProject }, "+ Baru")));
    view.append(wrap);
    if (!projects.length) { wrap.append(h("div", { class: "kad" }, "Medan masih kosong. Tekan + untuk tambah project pertama kau, contohnya Milogamingstore atau AI ROOM.")); return; }
    // Phase 6 (minimal, full redesign in Phase 7): waiting-for-approval strip, status cards, recent activity.
    const waiting = projects.filter((p) => p.pending && !p.archived);
    if (waiting.length) wrap.append(h("a", { class: "kad jalur", href: `#/project/${waiting[0].id}` }, h("span", { class: "titik-merah" }),
      h("div", {}, h("strong", {}, waiting.length === 1 ? "1 cadangan menunggu kelulusan" : `${waiting.length} cadangan menunggu kelulusan`),
        h("span", { class: "kecil" }, waiting.map((p) => p.name).join(", "))),
      h("span", { class: "cip" }, "Semak")));
    // Two summary cards and recent activity under the field (as in the preview).
    const summaryCards = (devlog) => {
      const sites = projects.filter((p) => p.url && !p.archived);
      const ok = sites.filter((p) => p.status === "ok").length, down = sites.filter((p) => p.status === "down").length;
      const week = Date.now() - 7 * 86400000;
      const names = projects.map((p) => p.name);
      const commits = devlog.filter((d) => d.ts >= week && names.some((n) => d.text.startsWith(n + ":"))).length;
      return h("div", { class: "grid2" },
        h("div", { class: "kad kad-stat" }, h("span", { class: "label" }, "Website dipantau"), h("span", { class: "nilai", style: { color: down ? "var(--bahaya)" : "" } }, sites.length ? (down ? `${down} down` : `${ok} ok`) : "–")),
        h("div", { class: "kad kad-stat" }, h("span", { class: "label" }, "Commit minggu ni"), h("span", { class: "nilai" }, String(commits))));
    };
    const activity = (devlog) => {
      const names = projects.map((p) => p.name);
      const rows = devlog.filter((d) => names.some((n) => d.text.startsWith(n + ":"))).slice(0, 5);
      const when = (ts) => {
        const d = new Date(ts), t0 = new Date(); t0.setHours(0, 0, 0, 0);
        return ts >= t0.getTime() ? d.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", hour12: false }) : ts >= t0.getTime() - 86400000 ? "Semalam" : d.toLocaleDateString("ms-MY", { day: "numeric", month: "short" });
      };
      return h("div", { class: "kad aktiviti" }, h("h3", {}, "Aktiviti terkini"),
        ...(rows.length ? rows.map((d) => h("div", { class: "baris-kecil" }, h("small", {}, when(d.ts)), h("span", {}, d.text)))
          : [h("p", { class: "muted" }, "Belum ada perubahan kod.")]));
    };
    setTimeout(async () => { const { devlog } = await A.api("notes"); if (wrap.isConnected) wrap.append(summaryCards(devlog), activity(devlog)); }, 0);
    if (listMode) {
      wrap.append(h("div", { class: "panel" }, ...projects.map((p) => h("a", { href: `#/project/${p.id}`, class: "note", style: { color: "inherit", textDecoration: "none" } },
        h("span", { class: "jenis" }, p.type), h("span", { class: "tajuk" }, p.name),
        p.pending ? h("span", { class: "badge tinggi" }, "tunggu lulus") : null, p.status === "down" ? h("span", { class: "badge tinggi" }, "down") : null))));
      return;
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "garis");
    svg.setAttribute("aria-hidden", "true");
    const field = h("div", { class: "medan", "aria-label": "Medan graviti project" });
    const core = h("button", { class: "teras", "aria-label": "Teras Asbab: kembali ke semua project" }, "Asbab");
    field.append(svg, core);
    wrap.append(field, h("p", { class: "kecil", style: { marginTop: "6px" } }, "Seret dan lempar kad. Tekan kad untuk jadikan ia teras baharu. Tekan Asbab untuk kembali."));

    let W = field.clientWidth, H = field.clientHeight;
    const C = () => ({ x: W / 2, y: H / 2 });
    // Jarak sasaran dalam bentuk elips supaya muat skrin telefon yang tinggi.
    const RX = () => Math.max(60, W / 2 - 70), RY = () => Math.max(60, H / 2 - 40);
    const level = (p) => (p.archived ? 0.98 : p.pending || p.status === "down" ? 0.55 : 0.8);
    const targetR = (p) => Math.min(RX(), RY()) * level(p);
    const nodes = projects.map((p, i) => {
      const el = h("div", { class: `nod${p.archived ? " arkib" : ""}${p.status === "down" ? " down" : ""}`, role: "button", tabindex: "0", "aria-label": `Project ${p.name}` },
        h("span", { class: "jalur-warna", style: { background: COLOR[p.type] || COLOR.biasa } }),
        h("strong", {}, p.name), h("small", {}, p.status === "down" ? "website down" : p.type === "kod" ? "project kod" : "project biasa"),
        p.pending ? h("span", { class: "lulus", title: "Tunggu kelulusan" }) : null);
      field.append(el);
      const a = (i / projects.length) * Math.PI * 2 - Math.PI / 2, k = level(p) * (p.born ? 0.2 : 1);
      return { p, el, x: C().x + Math.cos(a) * RX() * k, y: C().y + Math.sin(a) * RY() * k, vx: 0, vy: 0, hold: false, seed: Math.random() * 10 };
    });

    let focus = null, sats = [];
    const setFocus = (n) => {
      sats.forEach((s) => s.remove()); sats = [];
      focus = n;
      nodes.forEach((x) => x.el.classList.toggle("fokus", x === n));
      core.classList.toggle("kecil", !!n);
      if (!n) return;
      buzz(12);
      const p = n.p;
      const list = [
        ["Chat", () => dive(n.el, p)],
        ...(p.type === "kod" ? [[p.pending ? "Cadangan menunggu" : "Cadangan", () => dive(n.el, p), p.pending ? "#e8706a" : null]] : []),
        ["Nota", () => projectNotes(p)],
        ["Butiran", () => editProject(p)],
        [p.archived ? "Keluar arkib" : "Arkib", async () => { await A.api(`projects/${p.id}`, { method: "PATCH", body: { archived: !p.archived } }); route(); }],
        ...(p.url ? [["Buka website", () => Native.openUrl(p.url)]] : []),
      ];
      sats = list.map(([label, fn, color], i) => {
        const s = h("button", { class: "satelit", style: { animationDelay: i * 0.06 + "s", ...(color ? { boxShadow: `0 0 0 2px ${color}` } : {}) }, onclick: fn }, label);
        s.dataset.a = String((i / list.length) * Math.PI * 2 - Math.PI / 2);
        field.append(s);
        return s;
      });
    };
    core.onclick = () => setFocus(null);

    nodes.forEach((n) => {
      let sx, sy, moved = 0, lx, ly, lt;
      n.el.addEventListener("pointerdown", (e) => { n.hold = true; moved = 0; sx = lx = e.clientX; sy = ly = e.clientY; lt = performance.now(); n.el.setPointerCapture(e.pointerId); n.el.style.cursor = "grabbing"; });
      n.el.addEventListener("pointermove", (e) => {
        if (!n.hold) return;
        const dx = e.clientX - lx, dy = e.clientY - ly, now = performance.now();
        moved += Math.abs(dx) + Math.abs(dy);
        n.x += dx; n.y += dy;
        n.vx = (dx / Math.max(1, now - lt)) * 16; n.vy = (dy / Math.max(1, now - lt)) * 16;
        lx = e.clientX; ly = e.clientY; lt = now;
      });
      n.el.addEventListener("pointerup", () => { n.hold = false; n.el.style.cursor = ""; if (moved < 6) setFocus(focus === n ? null : n); });
      n.el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFocus(focus === n ? null : n); } });
    });

    const curve = (a, b, color, dash) => `<path d="M${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}" stroke="${color}"${dash ? ' stroke-dasharray="4 5"' : ""}/>`;
    let t0 = performance.now();
    const step = (ts) => {
      if (!field.isConnected) return;
      W = field.clientWidth; H = field.clientHeight;
      const c = C(), t = (ts - t0) / 1000, calm = still();
      const coreAt = focus ? { x: 46, y: 46 } : c;
      core.style.left = coreAt.x + "px"; core.style.top = coreAt.y + "px";
      for (const n of nodes) {
        if (n.hold) continue;
        let tx, ty;
        if (focus === n) { tx = c.x; ty = c.y; n.vx += (tx - n.x) * 0.06; n.vy += (ty - n.y) * 0.06; }
        else {
          const dx = n.x - c.x, dy = n.y - c.y, d = Math.hypot(dx, dy) || 1;
          const dn = Math.hypot(dx / RX(), dy / RY()) || 0.01;
          const want = focus ? 1.02 : level(n.p);
          const f = (want - dn) * Math.min(RX(), RY()) * 0.012;
          n.vx += (dx / d) * f; n.vy += (dy / d) * f;
          n.vx += (-dy / d) * 0.04; n.vy += (dx / d) * 0.04;
        }
        { const dx = n.x - coreAt.x, dy = n.y - coreAt.y, d = Math.hypot(dx, dy) || 1;
          if (focus !== n && d < 90) { const push = (90 - d) * 0.05; n.vx += (dx / d) * push; n.vy += (dy / d) * push; } }
        for (const m of [...nodes, ...sats.map((el) => ({ x: parseFloat(el.style.left) || -999, y: parseFloat(el.style.top) || -999 }))]) {
          if (m === n || (focus === n && !m.p)) continue;
          const dx = n.x - m.x, dy = n.y - m.y, d = Math.hypot(dx, dy) || 1, min = 96;
          if (d < min) { const push = (min - d) * 0.025; n.vx += (dx / d) * push; n.vy += (dy / d) * push; }
        }
        if (!calm) { n.vx += Math.sin(t * 0.7 + n.seed) * 0.03; n.vy += Math.cos(t * 0.6 + n.seed) * 0.03; }
        n.vx *= 0.86; n.vy *= 0.86;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(56, Math.min(W - 56, n.x)); n.y = Math.max(24, Math.min(H - 24, n.y));
      }
      let lines = "";
      for (const n of nodes) {
        n.el.style.left = n.x + "px"; n.el.style.top = n.y + "px";
        lines += curve(coreAt, n, COLOR[n.p.type] || COLOR.biasa, n.p.archived);
      }
      if (focus) sats.forEach((s) => {
        const a = Number(s.dataset.a) + (calm ? 0 : t * 0.08);
        const p = { x: focus.x + Math.cos(a) * RX() * 0.62, y: focus.y + Math.sin(a) * RY() * 0.5 };
        s.style.left = p.x + "px"; s.style.top = p.y + "px";
        lines += curve(focus, p, "rgba(237,230,207,0.45)", true);
      });
      svg.innerHTML = lines;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Notes that mention this project, plus a quick way to add one.
  async function projectNotes(p) {
    const { notes: all } = await A.api("notes");
    const key = p.name.toLowerCase();
    const mine = all.filter((n) => `${n.title} ${n.text}`.toLowerCase().includes(key)).slice(-30).reverse();
    const sheet = h("div", { class: "sheet stack", role: "dialog", "aria-label": `Nota ${p.name}` },
      h("div", { class: "row" }, h("h3", { style: { flex: 1 } }, `Nota: ${p.name}`), h("button", { class: "btn", onclick: () => sheet.remove() }, "Tutup")),
      mine.length ? h("div", { style: { maxHeight: "40vh", overflowY: "auto" } }, ...mine.map(noteRow)) : h("p", { class: "muted" }, "Belum ada nota yang menyebut project ini."),
      h("button", { class: "btn utama", onclick: () => { sheet.remove(); sheetForm(`Nota baru: ${p.name}`, [field("Nota", "text", { tag: "textarea", rows: 3 })], async (d) => {
        await A.api("notes", { method: "POST", body: { kind: "nota", title: `${p.name}: ${String(d.text).split("\n")[0].slice(0, 80)}`, text: d.text } });
      }); } }, "Tambah nota"));
    document.body.append(sheet);
  }

  function dive(el, p) {
    buzz(15);
    const r = el.getBoundingClientRect();
    const d = h("div", { class: "dive", style: { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", background: COLOR[p.type] || COLOR.biasa } });
    document.body.append(d, h("div", { class: "awan" }));
    requestAnimationFrame(() => {
      const s = Math.hypot(innerWidth, innerHeight) * 1.2;
      Object.assign(d.style, { left: innerWidth / 2 - s / 2 + "px", top: innerHeight / 2 - s / 2 + "px", width: s + "px", height: s + "px", opacity: "0" });
    });
    setTimeout(() => { location.hash = `#/project/${p.id}`; }, 650);
    setTimeout(() => { d.remove(); $(".awan")?.remove(); }, 1700);
  }

  function newProject() {
    sheetForm("Project baru", [
      field("Nama", "name", { required: true, placeholder: "Milogamingstore" }),
      field("Jenis", "type", { tag: "select", value: "biasa", options: [["biasa", "Biasa (chat dan nota)"], ["kod", "Kod (repo GitHub, Asbab boleh ubah kod)"]] }),
      field("Repo GitHub (untuk project kod)", "repo", { placeholder: "username/nama-repo" }),
      field("Branch", "branch", { value: "main" }),
      field("Alamat website untuk dipantau setiap 15 minit (pilihan)", "url", { type: "url", placeholder: "https://contoh.com" }),
    ], async (d) => {
      await A.api("projects", { method: "POST", body: d });
      A.boot = await A.api("bootstrap");
      route();
    });
  }

  /* ================= PROJECT: RUANG KERJA ================= */
  const CHANGE = /\b(tambah|baiki|fix|ubah|tukar|buang|betulkan|buat|letak|kemas ?kini|update|upgrade|naik ?taraf)\b/i;

  async function project(view, id) {
    A.boot = await A.api("bootstrap");
    const p = A.boot.projects.find((x) => x.id === id);
    if (!p) { location.hash = "#/project"; return; }
    Scene.sky(true);
    const head = h("div", { class: "row" },
      h("a", { href: "#/project", class: "btn" }, "Orbit"),
      h("h2", { style: { flex: 1 } }, p.name),
      h("span", { class: "badge" }, p.type === "kod" ? "project kod" : "project biasa"),
      p.status === "down" ? h("span", { class: "badge tinggi" }, "website down") : p.status === "ok" ? h("span", { class: "badge rendah" }, "website ok") : null);
    const tools = h("div", { class: "row" },
      h("button", { class: "btn", onclick: () => editProject(p) }, "Butiran"),
      p.url ? h("button", { class: "btn", onclick: async (e) => { e.target.textContent = "Menyemak…"; await Native.checkSites(); route(); } }, "Semak website") : null,
      h("button", { class: "btn", onclick: async () => { await A.api(`projects/${p.id}`, { method: "PATCH", body: { archived: !p.archived } }); location.hash = "#/project"; } }, p.archived ? "Keluarkan dari arkib" : "Arkib"),
      h("button", { class: "btn bahaya", onclick: async () => { if (!confirm(`Padam project "${p.name}"? Repo GitHub tak terjejas.`)) return; await A.api(`projects/${p.id}`, { method: "DELETE" }); location.hash = "#/project"; } }, "Padam"));
    const work = h("div", { id: "work", class: "stack" });
    const chatBox = h("div", {});
    view.append(h("div", { class: "wrap stack" }, head, tools,
      p.type === "kod" ? h("p", { class: "muted" }, "Minta perubahan dalam chat di bawah, contohnya \"tambah butang WhatsApp di footer\". Asbab akan tunjuk cadangan dulu, dan tiada apa yang berubah sebelum kau lulus.") : null,
      work, chatBox));
    await showProposal(p, work);
    await A.renderChat(view, `p-${p.id}`, {
      embedded: true, into: chatBox,
      onSend: async (text) => {
        if (p.type !== "kod" || !CHANGE.test(text)) return false;
        await proposeChange(p, text, work);
        return true;
      },
    });
  }

  function editProject(p) {
    sheetForm(`Butiran ${p.name}`, [
      field("Nama", "name", { value: p.name, required: true }),
      ...(p.special ? [] : [field("Jenis", "type", { tag: "select", value: p.type, options: Object.entries(Projects.TYPES).map(([id, t]) => [id, t.nama]) })]),
      field("Ejen lalai (untuk upgrade kod)", "agent", { tag: "select", value: p.agent || "asbab", options: [["asbab", "AI dalam Asbab"], ["gemini", "Gemini (GitHub)"]] }),
      field("Repo GitHub", "repo", { value: p.repo, placeholder: "username/nama-repo" }),
      field("Branch", "branch", { value: p.branch || "main" }),
      field("Alamat website", "url", { type: "url", value: p.url }),
      field("Orbit", "orbit", { tag: "select", value: p.orbit, options: [["dalam", "Dalam (aktif)"], ["luar", "Luar (jarang disentuh)"]] }),
    ], async (d) => { await A.api(`projects/${p.id}`, { method: "PATCH", body: d }); route(); });
  }

  // Phase 7.2: the code-writing part on its own, shared by the Phase 5 proposal flow and the in-app upgrade agent.
  // branch = read files from this branch (a request's own branch when fixing). Returns {summary, risk, explain, files, ...}.
  async function generateChange(p, task, { onStatus = () => {}, onStream = () => {}, branch } = {}) {
    const { files } = await A.api(`projects/${p.id}/files`);
    onStatus(`Repo ada ${files.length} fail. Memilih fail yang berkaitan…`);
    const pick = await A.think({
      role: "coding", maxTokens: 400,
      system: "Kau memilih fail kod yang perlu dibaca untuk satu tugasan. Balas HANYA dengan JSON array laluan fail, maksimum 10.",
      prompt: `Tugasan: ${task}\n\nSenarai fail:\n${files.slice(0, 800).map((f) => f.path).join("\n")}`,
    });
    let paths = [];
    try { paths = JSON.parse(pick.match(/\[[\s\S]*\]/)[0]); } catch { paths = files.slice(0, 5).map((f) => f.path); }
    onStatus(`Membaca ${paths.length} fail…`);
    const read = await A.api(`projects/${p.id}/read`, { method: "POST", body: { paths, branch } });
    onStatus("Menulis perubahan…");
    const system = `Kau ialah Asbab, developer peribadi Amin untuk project "${p.name}". Amin belum boleh membaca kod, jadi penjelasan mesti dalam Bahasa Melayu yang mudah.
Tulis perubahan yang diperlukan sahaja, dan kekalkan gaya kod sedia ada. Jangan sesekali masukkan kunci rahsia dalam kod.
Format jawapan mesti TEPAT begini:
RINGKASAN: satu baris apa yang berubah
RISIKO: rendah atau sederhana atau tinggi
PENJELASAN: 2 hingga 5 ayat mudah tentang apa yang akan berubah, kenapa, dan apa yang perlu Amin semak selepas naik
=== FILE: laluan/fail ===
(kandungan penuh fail baharu, tanpa markdown fence)
=== END FILE ===
Ulang blok FILE untuk setiap fail yang berubah. Tulis kandungan PENUH setiap fail.`;
    const prompt = `Tugasan: ${task}\n\nFail semasa:\n${read.files.map((f) => `### ${f.path}\n${f.content}`).join("\n\n")}`;
    const answer = await A.thinkFull({ weight: "heavy", maxTokens: 16000, system, prompt }, onStream);
    const parsed = parseProposal(answer.text);
    if (!parsed.files.length) throw new Error("Jawapan tak mengandungi fail dalam format yang betul. Cuba minta sekali lagi dengan lebih spesifik.");
    return { ...parsed, provider: answer.provider, fallback: answer.fallback, tokens: Math.round((system.length + prompt.length + answer.text.length) / 4) };
  }

  async function proposeChange(p, task, work) {
    if (!A.boot.ai) { work.prepend(h("div", { class: "panel err" }, "Otak kedua belum disambung (Tetapan > Sambungan dan API), jadi Asbab belum boleh mengubah kod.")); return; }
    if (!A.boot.github) { work.prepend(h("div", { class: "panel err" }, "Token GitHub belum disimpan (Tetapan > Sambungan dan API), jadi Asbab belum boleh membaca repo.")); return; }
    const box = $("#msgs");
    box?.append(h("div", { class: "msg user baru-user" }, task));
    const status = h("p", { class: "muted" }, "Asbab sedang meneliti repo…");
    const stream = h("div", { class: "stream" });
    const panel = h("div", { class: "panel stack" }, h("h3", {}, "Asbab sedang bekerja"), status, h("div", { class: "diff-wrap" }, stream));
    work.replaceChildren(panel);
    p.working = true;
    try {
      const parsed = await generateChange(p, task, { onStatus: (t) => { status.textContent = t; }, onStream: (t) => { stream.textContent = t.slice(-3000); stream.scrollTop = 1e9; } });
      await A.api(`projects/${p.id}/proposal`, { method: "POST", body: { task, ...parsed } });
      p.working = false;
      await showProposal(p, work);
      const b = await A.api(`rooms/p-${p.id}`);
      document.dispatchEvent(new CustomEvent("asbab:refresh", { detail: b.messages }));
    } catch (e) {
      p.working = false;
      work.replaceChildren(h("div", { class: "panel" }, h("p", { class: "err" }, e.message)));
    }
  }
  function parseProposal(text) {
    const line = (k) => (text.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1]?.trim() || "";
    const explain = (text.match(/^PENJELASAN:\s*([\s\S]*?)(?=^=== FILE:)/m) || [])[1]?.trim() || "";
    const files = [];
    const re = /^=== FILE: (.+?) ===[ \t]*\r?\n([\s\S]*?)\r?\n=== END FILE ===/gm;
    let m;
    while ((m = re.exec(text))) {
      let content = m[2];
      const fence = content.match(/^```[\w-]*\r?\n([\s\S]*?)\r?\n```\s*$/);
      if (fence) content = fence[1];
      if (!content.endsWith("\n")) content += "\n";
      files.push({ path: m[1].trim().replace(/^\/+/, ""), content });
    }
    return { summary: line("RINGKASAN") || "Perubahan project", risk: line("RISIKO").toLowerCase().split(/\s/)[0], explain, files };
  }

  async function showProposal(p, work) {
    const { proposal: pr } = await A.api(`projects/${p.id}/proposal`);
    work.replaceChildren();
    if (!pr) return;
    if (pr.status === "menunggu") return work.append(approvalCard(p, pr, work));
    if (pr.status === "lulus") {
      work.append(h("div", { class: "panel stack" },
        h("h3", {}, `Dah naik: ${pr.summary}`),
        h("p", { class: "muted" }, `Commit ${pr.commit.sha.slice(0, 7)}. Semak website kau. Kalau ada masalah, patah balik.`),
        h("div", { class: "row" },
          h("button", { class: "btn", onclick: () => Native.openUrl(pr.commit.url) }, "Lihat commit"),
          p.url ? h("button", { class: "btn", onclick: () => Native.openUrl(p.url) }, "Buka website") : null,
          h("button", { class: "btn bahaya", onclick: async (e) => {
            if (!confirm("Patah balik ke versi sebelum perubahan ni?")) return;
            e.target.closest(".panel").classList.add("putar-balik");
            buzz(40);
            try { await A.api(`projects/${p.id}/revert`, { method: "POST" }); await showProposal(p, work); }
            catch (err) { alert(err.message); }
          } }, "Patah balik"))));
    }
  }

  function approvalCard(p, pr, work) {
    const newFiles = pr.files.filter((f) => !f.exists).length;
    const hold = h("button", { class: "hold", "aria-label": "Tekan dan tahan untuk lulus" }, h("span", { class: "isi" }), h("span", {}, "Tekan dan tahan untuk lulus"));
    let timer;
    const begin = (e) => {
      e.preventDefault();
      hold.classList.add("tekan");
      buzz(10);
      timer = setTimeout(async () => {
        hold.querySelector("span:last-child").textContent = "Menaikkan…";
        buzz([20, 40, 60]);
        try {
          await A.api(`projects/${p.id}/approve`, { method: "POST" });
          document.body.append(h("div", { class: "komet" }));
          setTimeout(() => $(".komet")?.remove(), 1800);
          await showProposal(p, work);
        } catch (err) { hold.classList.remove("tekan"); hold.querySelector("span:last-child").textContent = err.message; }
      }, 1300);
    };
    const cancel = () => { clearTimeout(timer); hold.classList.remove("tekan"); };
    hold.addEventListener("pointerdown", begin);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => hold.addEventListener(ev, cancel));
    hold.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") begin(e); });
    hold.addEventListener("keyup", cancel);

    const card = h("div", { class: "panel stack proposal" },
      h("div", { class: "row" }, h("h3", { style: { flex: 1 } }, pr.summary), h("span", { class: `badge ${pr.risk}` }, `risiko ${pr.risk}`)),
      pr.explain ? h("p", {}, pr.explain) : null,
      h("div", { class: "files" }, ...pr.files.map((f) => h("div", {}, `${f.exists ? "ubah" : "baharu"}  ${f.path}`))),
      h("p", { class: "muted mobile-only" }, `${pr.files.length} fail${newFiles ? `, ${newFiles} baharu` : ""}. Buka di komputer untuk lihat kod penuh.`),
      ...pr.files.map((f) => diffEl(f)),
      hold,
      h("div", { class: "row" },
        h("button", { class: "btn", onclick: () => {
          const q = prompt("Apa yang kau nak tanya tentang cadangan ni?");
          if (q) A.sendMessage(`p-${p.id}`, `Tentang cadangan "${pr.summary}": ${q}`);
        } }, "Tanya lagi"),
        h("button", { class: "btn bahaya", onclick: async () => {
          stardust(card);
          await A.api(`projects/${p.id}/reject`, { method: "POST" });
          setTimeout(() => showProposal(p, work), 900);
        } }, "Tolak")));
    return card;
  }

  function stardust(el) {
    const r = el.getBoundingClientRect();
    el.style.transition = "opacity .6s"; el.style.opacity = "0";
    for (let i = 0; i < 60; i++) {
      const d = h("div", { class: "debu", style: { left: r.left + Math.random() * r.width + "px", top: r.top + Math.random() * r.height + "px" } });
      document.body.append(d);
      requestAnimationFrame(() => { d.style.transform = `translate(${(Math.random() - 0.5) * 160}px, ${-40 - Math.random() * 140}px)`; d.style.opacity = "0"; });
      setTimeout(() => d.remove(), 1300);
    }
  }

  function lineDiff(a, b) {
    const A1 = a.split("\n"), B1 = b.split("\n"), n = A1.length, m = B1.length, W = m + 1;
    if ((n + 1) * (m + 1) > 4e6) return null;
    const T = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      T[i * W + j] = A1[i] === B1[j] ? T[(i + 1) * W + j + 1] + 1 : Math.max(T[(i + 1) * W + j], T[i * W + j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (A1[i] === B1[j]) { out.push([" ", A1[i]]); i++; j++; }
      else if (T[(i + 1) * W + j] >= T[i * W + j + 1]) out.push(["-", A1[i++]]);
      else out.push(["+", B1[j++]]);
    }
    while (i < n) out.push(["-", A1[i++]]);
    while (j < m) out.push(["+", B1[j++]]);
    return out;
  }

  function diffEl(f) {
    const box = h("div", { class: "diff", "aria-label": `Perubahan kod ${f.path}` });
    const line = (cls, t) => box.append(h("div", { class: cls }, t));
    line("sela", `— ${f.path}`);
    const ops = f.exists ? lineDiff(f.original, f.content) : f.content.split("\n").map((s) => ["+", s]);
    if (!ops) { f.content.split("\n").forEach((s) => line("", s)); return box; }
    ops.forEach((op, k) => {
      if (op[0] === " ") {
        const near = ops.slice(Math.max(0, k - 3), k + 4).some((o) => o[0] !== " ");
        if (!near) { if (box.lastChild?.className !== "sela") line("sela", "⋯"); return; }
        line("", "  " + op[1]);
      } else line(op[0] === "+" ? "tambah" : "buang", `${op[0]} ${op[1]}`);
    });
    return box;
  }

  document.addEventListener("asbab:refresh", (e) => {
    const box = $("#msgs");
    if (!box) return;
    const last = e.detail[e.detail.length - 1];
    if (last) box.append(h("div", { class: "msg asbab baru-asbab" }, last.text));
  });

  /* ================= CATATAN ================= */
  // Catatan (Phase 6): tabs Semua / Jadual / Belanja / Idea with a sliding glass marker; cards fall in one by one.
  const NOTE_TABS = [["semua", "Semua"], ["jadual", "Jadual"], ["belanja", "Belanja"], ["idea", "Idea"]];
  async function notes(view, wantTab, noteId, extra) {
    Scene.setScene("sungai");
    // "Rekod belanja RM.." from a receipt in chat (Phase 6.2): open the Belanja tab with the form filled in.
    if (wantTab === "rekod") {
      const amt = Number(noteId) || "";
      let shop = "";
      try { shop = decodeURIComponent(extra || ""); } catch { shop = extra || ""; }
      history.replaceState(null, "", "#/catatan/belanja");
      wantTab = "belanja"; noteId = null;
      setTimeout(() => addBelanja(amt, shop), 300);
    }
    if (NOTE_TABS.some(([id]) => id === wantTab)) localStorage.setItem("asbab:tab6", wantTab);
    let tab = localStorage.getItem("asbab:tab6") || "semua";
    const addBtn = h("button", { class: "ikon-btn", "aria-label": "Catatan baru", html: ICON.plus, onclick: () => sheetForm("Catatan baru", [
      field("Jenis", "kind", { tag: "select", value: tab === "semua" ? "nota" : tab, options: [["nota", "Nota"], ["jadual", "Jadual"], ["idea", "Idea"], ["makan", "Makan"], ["belanja", "Belanja"]] }),
      field("Tajuk", "title", { required: true }),
      field("Butiran", "text", { tag: "textarea", rows: 3 }),
      field("Tarikh", "date", { type: "date", value: todayISO() }),
      field("Masa", "time", { type: "time" }),
      field("Jumlah RM (untuk belanja)", "amount", { type: "number", step: "0.01" }),
    ], async (d) => { const r = await A.api("notes", { method: "POST", body: { ...d, amount: d.amount ? Number(d.amount) : undefined } }); A.toast(r.budget || "Disimpan"); route(); }) });
    const body = h("div", { class: "stack" }, h("div", { class: "rangka", style: { height: "64px" } }), h("div", { class: "rangka", style: { height: "64px" } }));
    const marker = h("span", { class: "penanda" });
    const tabs = h("div", { class: "tab-kaca", role: "tablist" }, marker, ...NOTE_TABS.map(([id, label], i) => h("button", {
      role: "tab", "data-i": i, class: id === tab ? "aktif" : "", "aria-selected": String(id === tab),
      onclick: (e) => { tab = id; localStorage.setItem("asbab:tab6", id); place(); paint(); buzz(6); },
    }, label)));
    const place = () => {
      const i = NOTE_TABS.findIndex(([id]) => id === tab);
      // The glass marker takes the size and place of the chosen button (as in the preview).
      const b = tabs.querySelectorAll("button")[i];
      if (b && b.offsetWidth) { marker.style.width = b.offsetWidth + "px"; marker.style.transform = `translateX(${b.offsetLeft}px)`; }
      else { marker.style.width = `calc((100% - 8px) / ${NOTE_TABS.length})`; marker.style.transform = `translateX(calc(4px + ${i * 100}%))`; }
      tabs.querySelectorAll("button").forEach((b, j) => { b.classList.toggle("aktif", j === i); b.setAttribute("aria-selected", String(j === i)); });
    };
    view.append(h("div", { class: "wrap stack" }, A.heading("Catatan", null, addBtn), tabs, body));
    place();
    requestAnimationFrame(place);
    const { notes: all } = await A.api("notes");
    const today = todayISO();
    const paint = () => {
      let list = all.slice();
      const head = [];
      if (tab === "jadual") {
        list = list.filter((n) => n.kind === "jadual").sort((a, b) => ((a.date < today) - (b.date < today)) || (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
      } else if (tab === "belanja") {
        list = list.filter((n) => n.kind === "belanja").sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
        const sum = (f) => list.filter(f).reduce((x, n) => x + (n.amount || 0), 0);
        const week = new Date(today); week.setDate(week.getDate() - 6);
        const wIso = week.toISOString().slice(0, 10);
        const had = A.boot.settings.belanjaHad || {};
        const cell = (label, v, limit) => h("div", { class: "kad kad-stat", style: { minHeight: "88px" } }, h("span", { class: "label" }, label), h("span", { class: "nilai", style: { fontSize: "1.2rem" } }, rm(v)),
          limit ? h("span", { class: "bar" }, h("i", { style: { width: Math.min(100, (v / limit) * 100) + "%", background: v >= limit ? "#ff8787" : "" } })) : null);
        head.push(h("div", { class: "grid2", style: { gridTemplateColumns: "1fr 1fr 1fr" } },
          cell("Hari ini", sum((n) => n.date === today), Number(had.harian) || 0),
          cell("7 hari", sum((n) => n.date >= wIso)),
          cell("Bulan ini", sum((n) => n.date.slice(0, 7) === today.slice(0, 7)), Number(had.bulanan) || 0)));
      } else if (tab === "idea") {
        list = list.filter((n) => n.kind === "idea").sort((a, b) => (b.ts || 0) - (a.ts || 0));
      } else {
        list = list.sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
      }
      const cards = list.slice(0, 200).map((n, i) => { const c = noteRow(n); c.style.animationDelay = Math.min(i, 12) * 0.04 + "s"; return c; });
      const empty = { semua: "Belum ada catatan. Berbual dengan Asbab dan dia akan mula mencatat.", jadual: "Tiada jadual. Asbab tambah sendiri bila jumpa dalam perbualan.", belanja: "Tiada belanja direkod.", idea: "Tiada idea lagi. Taip \"idea: ...\" dalam chat." }[tab];
      body.replaceChildren(...head, cards.length ? h("div", { class: "senarai-nota" }, ...cards) : h("p", { class: "muted" }, empty),
        cards.length ? h("p", { class: "nota-petua" }, "Leret kad ke kiri untuk padam. Tekan lama untuk Edit.") : null);
    };
    paint();
    if (noteId) setTimeout(() => {
      const n = all.find((x) => x.id === noteId);
      if (!n) return;
      const row = document.querySelector(`[data-note="${noteId}"]`);
      if (row) { row.scrollIntoView({ block: "center" }); row.classList.add("sorot"); }
      openNote(n);
    }, 350);
  }

  /* ---------- Note actions (Phase 5.2): open, edit, delete with undo ---------- */
  async function deleteNote(n, row) {
    const r = await A.api(`notes/${n.id}`, { method: "DELETE" });
    if (row) { row.style.opacity = "0"; setTimeout(() => row.remove(), 200); }
    buzz(20);
    A.toast("Catatan dipadam", { action: { label: "Batal", fn: async () => {
      await A.api("notes/restore", { method: "POST", body: { note: r.note || n } });
      route();
    } } });
  }

  function editNote(n) {
    sheetForm("Edit catatan", [
      field("Jenis", "kind", { tag: "select", value: n.kind, options: [["nota", "Nota"], ["jadual", "Jadual"], ["idea", "Idea"], ["makan", "Makan"], ["belanja", "Belanja"], ["log", "Log"]] }),
      field("Tajuk", "title", { value: n.title, required: true }),
      field("Butiran", "text", { tag: "textarea", rows: 3, value: n.text || "" }),
      field("Tarikh", "date", { type: "date", value: n.date }),
      field("Masa", "time", { type: "time", value: n.time || "" }),
      field("Jumlah RM (untuk belanja)", "amount", { type: "number", step: "0.01", value: n.amount ?? "" }),
    ], async (d) => { await A.api(`notes/${n.id}`, { method: "PATCH", body: d }); A.toast("Disimpan"); route(); });
  }

  // Opens one note: what Asbab saved, with Edit and Padam.
  function openNote(n) {
    const s = A.sheet(n.title,
      h("p", { class: "muted" }, `${n.kind} · ${n.date}${n.time ? " " + n.time : ""}${n.amount ? " · " + rm(n.amount) : ""}`),
      n.text && n.text !== n.title ? h("p", { style: { whiteSpace: "pre-wrap" } }, n.text) : null,
      h("div", { class: "row" },
        // Phase 7.2: Bank Idea -> an upgrade request for Asbab.
        n.kind === "idea" ? h("button", { class: "btn utama", onclick: () => { s.close(); Upgrades.newRequest(null, { text: `${n.title}${n.text && n.text !== n.title ? `: ${n.text}` : ""}` }); } }, "Jadikan permintaan") : null,
        h("button", { class: "btn", onclick: () => { s.close(); editNote(n); } }, "Edit"),
        h("button", { class: "btn bahaya", onclick: () => { s.close(); deleteNote(n, document.querySelector(`[data-note="${n.id}"]`)); } }, "Padam")));
  }

  function longPressMenu(n, row) {
    buzz(15);
    const s = A.sheet(n.title,
      h("button", { class: "pilihan", onclick: () => { s.close(); editNote(n); } }, h("strong", {}, "Edit")),
      h("button", { class: "pilihan", onclick: () => { s.close(); deleteNote(n, row); } }, h("strong", { style: { color: "var(--bahaya)" } }, "Padam")));
  }

  // "Esok, 13:10" / "Hari ini, 15:00" / "RM6.00" / "Idea, 3 hari lepas" (as in the preview).
  function subLine(n) {
    const t = todayISO();
    const d = n.date === t ? "Hari ini" : n.date === Core.addDays(t, 1) ? "Esok" : n.date === Core.addDays(t, -1) ? "Semalam" : n.date;
    if (n.kind === "belanja") return `${rm(n.amount)} · ${d}`;
    if (n.kind === "idea") return `Idea, ${d.toLowerCase() === d ? d : d.toLowerCase()}`;
    if (n.kind === "jadual") return `${d}${n.time ? ", " + n.time : ""}`;
    return `${n.kind} · ${d}${n.time ? ", " + n.time : ""}`;
  }

  // Swipe left to delete; long press for Edit/Padam; tap to open.
  function noteRow(n) {
    const IK = { jadual: ICON.jadual, belanja: ICON.wang, idea: ICON.idea, makan: ICON.catatan, log: ICON.info, nota: ICON.catatan };
    const row = h("div", { class: "kad-nota note" },
      h("span", { class: "ikon", html: IK[n.kind] || ICON.catatan }),
      h("span", { style: { minWidth: 0 } }, h("div", { class: "tajuk" }, n.title), h("div", { class: "sub" }, subLine(n))),
      n.amount && n.kind !== "belanja" ? h("span", { class: "jumlah" }, rm(n.amount)) : h("span"));
    const box = h("div", { class: "nota", "data-note": n.id }, h("div", { class: "padam", "aria-hidden": "true" }, "Padam"), row);
    let x0 = 0, y0 = 0, dx = 0, timer = null, moved = false, pressed = false;
    row.addEventListener("pointerdown", (e) => {
      x0 = e.clientX; y0 = e.clientY; dx = 0; moved = false; pressed = false;
      timer = setTimeout(() => { pressed = true; longPressMenu(n, box); }, 550);
    });
    row.addEventListener("pointermove", (e) => {
      const ddx = e.clientX - x0, ddy = e.clientY - y0;
      if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) { moved = true; clearTimeout(timer); }
      if (Math.abs(ddx) > Math.abs(ddy) && ddx < 0) { dx = ddx; row.classList.add("leret"); box.classList.add("leret-aktif"); row.style.transform = `translateX(${dx}px)`; }
    });
    const end = () => {
      clearTimeout(timer);
      row.classList.remove("leret");
      if (dx < -110) { row.style.transform = "translateX(-110%)"; deleteNote(n, box); }
      else { row.style.transform = ""; box.classList.remove("leret-aktif"); if (!moved && !pressed) openNote(n); }
      dx = 0;
    };
    row.addEventListener("pointerup", end);
    row.addEventListener("pointercancel", () => { clearTimeout(timer); row.classList.remove("leret"); box.classList.remove("leret-aktif"); row.style.transform = ""; dx = 0; });
    row.addEventListener("contextmenu", (e) => e.preventDefault());
    return box;
  }

  function pustaka(body, all) {
    const days = 28;
    const t0 = new Date(todayISO() + "T00:00:00");
    const counts = Array.from({ length: days }, (_, i) => {
      const d = new Date(t0); d.setDate(d.getDate() - (days - 1 - i));
      const iso = d.toISOString().slice(0, 10);
      return all.filter((n) => n.date === iso || new Date(n.ts).toISOString().slice(0, 10) === iso).length;
    });
    const max = Math.max(1, ...counts);
    const pts = counts.map((c, i) => [(i / (days - 1)) * 340, 100 - (c / max) * 80]);
    const d = `M0 110 ${pts.map((p, i) => (i ? `Q${(pts[i - 1][0] + p[0]) / 2} ${Math.min(pts[i - 1][1], p[1]) - 6} ${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`)).join(" ")} L340 110 Z`;
    body.append(h("div", { class: "panel range" }, h("p", { class: "muted" }, "Banjaran aktiviti 4 minggu: makin tinggi gunung, makin banyak yang dicatat."),
      h("div", { html: `<svg viewBox="0 0 340 110" preserveAspectRatio="none" role="img" aria-label="Graf aktiviti 4 minggu"><path class="gunung" d="${d}"/></svg>` })));

    const byWeek = new Map();
    for (const n of all) {
      const dt = new Date(n.date + "T00:00:00");
      const monday = new Date(dt); monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      if (!byWeek.has(key)) byWeek.set(key, []);
      byWeek.get(key).push(n);
    }
    const weeks = [...byWeek.keys()].sort().reverse();
    if (!weeks.length) { body.append(h("p", { class: "muted" }, "Pustaka masih kosong. Berbual dengan Asbab, dan dia akan mula mencatat.")); return; }
    let sel = weeks[0];
    const page = h("div", { class: "panel page" });
    const hues = ["#a9b4e0", "#e8a35c", "#8db886", "#ede6cf", "#c7a0c9"];
    const shelf = h("div", { class: "shelf", role: "tablist", "aria-label": "Buku mingguan" }, ...weeks.map((w, i) => {
      const b = h("button", { class: `book${w === sel ? " aktif" : ""}`, style: { background: hues[i % hues.length], height: 90 + Math.min(60, byWeek.get(w).length * 4) + "px" }, onclick: () => {
        sel = w; shelf.querySelectorAll(".book").forEach((x) => x.classList.toggle("aktif", x === b)); paint(); buzz(8);
      } }, `Minggu ${w.slice(5)}`);
      return b;
    }));
    const paint = () => {
      const items = byWeek.get(sel).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
      const byDay = {};
      for (const n of items) (byDay[n.date] ||= []).push(n);
      page.replaceChildren(...Object.entries(byDay).map(([dte, list]) => h("div", {}, h("h3", {}, dte), ...list.map(noteRow))));
      page.style.animation = "none"; void page.offsetWidth; page.style.animation = "";
    };
    paint();
    body.append(shelf, page);
  }

  function ideaSky(body, ideas) {
    const sky = h("div", { class: "idea-sky", role: "list", "aria-label": "Bank Idea" });
    if (!ideas.length) { body.append(h("div", { class: "panel" }, "Tiada idea lagi. Taip \"idea: ...\" dalam chat, dan ia akan jadi bintang di sini.")); return; }
    const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const pos = ideas.map((n) => { const v = hash(n.id); return [8 + (v % 84), 10 + ((v >> 8) % 76)]; });
    const words = ideas.map((n) => new Set(`${n.title} ${n.text}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4)));
    const lines = [];
    for (let i = 0; i < ideas.length; i++) for (let j = i + 1; j < ideas.length; j++)
      if ([...words[i]].some((w) => words[j].has(w))) lines.push(`<line x1="${pos[i][0]}%" y1="${pos[i][1]}%" x2="${pos[j][0]}%" y2="${pos[j][1]}%"/>`);
    sky.append(h("div", { html: `<svg aria-hidden="true">${lines.join("")}</svg>` }));
    ideas.forEach((n, i) => sky.append(h("button", { class: "idea-star", role: "listitem", style: { left: pos[i][0] + "%", top: pos[i][1] + "%" }, onclick: () => alert(`${n.title}\n\n${n.text || ""}`) }, h("i", { style: { animationDelay: (i % 5) * 0.6 + "s" } }), n.title.slice(0, 40))));
    body.append(sky, h("p", { class: "muted" }, "Idea yang berkongsi perkataan disambung jadi buruj."));
  }

  function belanjaList(body, list) {
    const t = todayISO();
    const week = new Date(t); week.setDate(week.getDate() - 6);
    const wIso = week.toISOString().slice(0, 10);
    const sum = (f) => list.filter(f).reduce((a, n) => a + (n.amount || 0), 0);
    body.append(h("div", { class: "panel row" },
      h("div", { style: { flex: 1 } }, h("p", { class: "muted" }, "Hari ini"), h("h2", {}, rm(sum((n) => n.date === t)))),
      h("div", { style: { flex: 1 } }, h("p", { class: "muted" }, "7 hari"), h("h2", {}, rm(sum((n) => n.date >= wIso)))),
      h("div", { style: { flex: 1 } }, h("p", { class: "muted" }, "Bulan ini"), h("h2", {}, rm(sum((n) => n.date.slice(0, 7) === t.slice(0, 7)))))),
    h("div", { class: "panel" }, ...list.slice().reverse().slice(0, 60).map(noteRow)));
  }

  /* ================= TETAPAN ================= */
  // [id, line icon, title, search words, group] (Phase 6: line icons, grouped list)
  // Group names and titles follow the preview (Umum / Otak kedua / Peringatan ...).
  const CATS = [
    ["profil", "profil", "Profil", "nama zon solat lokasi cuaca had belanja", "Umum"],
    ["tema", "rupa", "Wallpaper dan rupa", "wallpaper gambar tema warna fon blur kaca gelap cerah aurora emas laut senja hutan animasi", "Umum"],
    ["sambungan", "sambungan", "Sambungan dan API", "api key gemini claude openai model github token sandaran uji", "Otak kedua"],
    ["otak", "otak", "Otak kedua", "ai had izin penggunaan mod tanpa ai", "Otak kedua"],
    ["personaliti", "personaliti", "Personaliti", "personaliti cara bercakap nilai", "Otak kedua"],
    ["suara", "loceng", "Mod Bilal", "bilal solat azan masjid bunyi taklimat pagi check-in petang waktu senyap keutamaan ringkasan mingguan", "Peringatan"],
    ["akses", "telefon", "Akses telefon", "suis whatsapp email sms bank skrin senarai blok simpan jeda", "Peringatan"],
    ["butang", "bulan", "Butang bulan terapung", "butang bulan jalur kedudukan terapung kamera lampu kunci", "Peringatan"],
    ["data", "data", "Data dan backup", "backup eksport pulih identiti had belanja", "Data dan keselamatan"],
    ["keselamatan", "kunci", "Kunci app", "cap jari pin kunci keselamatan", "Data dan keselamatan"],
    ["tentang", "info", "Tentang Asbab", "versi update kemas kini log perkembangan", "Tentang"],
  ];

  // Short grey text on the right of each row (as in the preview).
  function shortInfo(id, s) {
    const tm = Theme.get();
    return {
      profil: s.name,
      tema: tm.preset === "auto" ? "Ikut telefon" : tm.preset === "custom" ? "Warna sendiri" : (Theme.PRESETS[tm.preset]?.nama || ""),
      sambungan: Ai.IDS.filter((id) => (A.boot.aiKeys || {})[id]).map((id) => Ai.byId(id).label).join(", ") || "Belum",
      suara: `${s.bilalLead} minit`,
      akses: `${["whatsapp", "email", "sms_bank", "skrin", "penggunaan_app"].filter((k) => s.access[k]).length} hidup`,
      data: s.backupRepo ? "Harian" : "Belum",
      keselamatan: s.kunci?.on === false ? "Mati" : `${s.kunci?.minit ?? 3} minit`,
      tentang: A.boot.version,
    }[id] || "";
  }
  function summary(id, s) {
    const tm = Theme.get();
    return {
      profil: `${s.name} · zon ${s.zone}`,
      tema: `${tm.preset === "auto" ? "Ikut telefon" : tm.preset === "custom" ? "Warna sendiri" : (Theme.PRESETS[tm.preset]?.nama || "")} · ${Theme.FONTS[tm.font]?.nama || "Fon telefon"}`,
      sambungan: `Chat: ${Ai.byId(Ai.config(s).roles.chat).label} · ${Ai.IDS.filter((id) => (A.boot.aiKeys || {})[id]).length} AI ada key · GitHub ${A.boot.github ? "ada" : "belum"}`,
      otak: s.aiEnabled ? `Hidup · ${A.boot.usage.count} permintaan hari ini` : "Dimatikan (mod tanpa AI)",
      suara: `Mod Bilal ${s.bilalLead} minit · taklimat ${s.briefTime} · senyap ${s.quietFrom}-${s.quietTo}`,
      personaliti: s.personality.slice(0, 60) + "…",
      akses: `${["whatsapp", "email", "sms_bank", "skrin", "penggunaan_app"].filter((k) => s.access[k]).length} daripada 5 suis hidup`,
      butang: s.bubble ? "Terapung di atas app lain" : "Dalam Asbab sahaja",
      data: s.backupRepo ? `Backup harian ke ${s.backupRepo}` : "Backup belum ditetapkan",
      keselamatan: s.kunci?.on === false ? "Kunci dimatikan" : `Cap jari / PIN · ${s.kunci?.minit ?? 3} minit`,
      tentang: `Versi ${A.boot.version}`,
    }[id];
  }

  async function settings(view, cat) {
    Scene.setScene("gunung");
    const { settings: s } = await A.api("settings");
    A.boot.settings = s;
    if (!cat) {
      // Grouped list with thin rows, line icons and switches in the row.
      const quick = {
        otak: () => h("input", { type: "checkbox", class: "suis", checked: s.aiEnabled !== false, "aria-label": "Guna otak kedua", onclick: (e) => e.stopPropagation(),
          onchange: async (e) => { const d = await A.api("settings", { method: "PUT", body: { aiEnabled: e.target.checked } }); A.boot.settings = d.settings; A.toast(e.target.checked ? "Otak kedua hidup" : "Mod tanpa AI"); } }),
        butang: () => h("input", { type: "checkbox", class: "suis", checked: !!s.bubble, "aria-label": "Butang bulan terapung", onclick: (e) => e.stopPropagation(),
          onchange: async (e) => { const d = await A.api("settings", { method: "PUT", body: { bubble: e.target.checked } }); A.boot.settings = d.settings; await Native.bubbleSync({ unhide: true }); A.toast("Disimpan"); } }),
      };
      // Switches that sit right in the list (preview: "Kesan latar bergerak", "Minta izin dulu").
      const inline = {
        tema: ["lampu", "Kesan latar bergerak", "animasi latar bergerak alam", () => h("input", { type: "checkbox", class: "suis", checked: s.animations === "penuh", "aria-label": "Kesan latar bergerak",
          onchange: async (e) => { const d = await A.api("settings", { method: "PUT", body: { animations: e.target.checked ? "penuh" : "ringan" } }); A.boot.settings = d.settings; document.body.classList.toggle("ringan", d.settings.animations === "ringan"); A.toast("Disimpan"); } })],
        sambungan: ["jam", "Minta izin dulu", "izin sebelum guna otak kedua ai", () => h("input", { type: "checkbox", class: "suis", checked: !!s.askBeforeAI, "aria-label": "Minta izin sebelum guna otak kedua",
          onchange: async (e) => { const d = await A.api("settings", { method: "PUT", body: { askBeforeAI: e.target.checked } }); A.boot.settings = d.settings; A.toast("Disimpan"); } })],
        suara: ["hari", "Taklimat pagi", "taklimat pagi brief", null],
      };
      const box = h("div", {});
      const paint = (q = "") => {
        const hit = (text) => !q || text.toLowerCase().includes(q.toLowerCase());
        const shown = CATS.filter(([id, , title, kw]) => hit(`${title} ${kw}`));
        const groups = [...new Set(shown.map((c) => c[4]))];
        const rowsFor = (c) => {
          const [id, icon, title] = c;
          const out = [h("a", { href: `#/tetapan/${id}`, class: "baris", title: summary(id, s) },
            h("span", { class: "ikon", html: ICON[icon] }),
            h("span", { class: "teks" }, h("strong", {}, title), h("span", {}, summary(id, s))),
            quick[id] ? quick[id]() : h("span", { class: "kanan" }, `${shortInfo(id, s)} ›`))];
          const extra = inline[id];
          if (extra && hit(`${extra[1]} ${extra[2]}`)) {
            out.push(extra[3]
              ? h("label", { class: "baris" }, h("span", { class: "ikon", html: ICON[extra[0]] }), h("span", { class: "teks" }, h("strong", {}, extra[1])), extra[3]())
              : h("a", { href: `#/tetapan/${id}`, class: "baris" }, h("span", { class: "ikon", html: ICON[extra[0]] }), h("span", { class: "teks" }, h("strong", {}, extra[1])), h("span", { class: "kanan" }, `${s.briefTime} ›`)));
          }
          return out;
        };
        box.replaceChildren(...groups.map((g) => h("div", { class: "kumpulan" }, h("h4", {}, g),
          h("div", { class: "senarai" }, ...shown.filter((c) => c[4] === g).flatMap(rowsFor)))));
        if (!shown.length) box.append(h("p", { class: "muted" }, "Tiada tetapan yang sepadan."));
      };
      paint();
      view.append(h("div", { class: "wrap" }, A.heading("Tetapan"),
        h("input", { class: "cari-tetapan", type: "search", placeholder: "Cari tetapan, contohnya tema atau bilal", "aria-label": "Cari tetapan", oninput: (e) => paint(e.target.value) }),
        box));
      return;
    }
    const meta = CATS.find((c) => c[0] === cat);
    if (!meta) { location.hash = "#/tetapan"; return; }
    const page = h("div", { class: "wrap stack" }, h("div", { class: "tajuk-sub" },
      h("a", { href: "#/tetapan", class: "kembali", "aria-label": "Kembali ke Tetapan" }, "‹ Tetapan"), h("h1", {}, meta[2])));
    view.append(page);
    const status = h("p", { class: "muted", role: "status" });
    const save = async (patch) => {
      const d = await A.api("settings", { method: "PUT", body: patch });
      A.boot.settings = d.settings;
      A.toast("Disimpan"); buzz(15);
      return d.settings;
    };
    const formOf = (fields, collect) => {
      const f = h("form", { class: "panel stack", onsubmit: async (e) => { e.preventDefault(); await save(collect(new FormData(f))); } }, ...fields,
        h("div", { class: "row" }, h("button", { class: "btn utama", type: "submit" }, "Simpan"), status));
      return f;
    };
    const sw = (name, label, on, note) => h("label", { class: "toggle" }, h("span", {}, label, note ? h("span", { class: "muted", style: { display: "block" } }, note) : null), h("input", { type: "checkbox", name, checked: on }));

    const P = {
      profil: () => formOf([
        field("Nama", "name", { value: s.name }),
        field("Zon waktu solat JAKIM", "zone", { value: s.zone, placeholder: "KDH01" }),
        h("div", { class: "row" }, field("Latitud (cuaca)", "lat", { type: "number", step: "0.0001", value: s.lat }), field("Longitud", "lon", { type: "number", step: "0.0001", value: s.lon })),
        h("h3", {}, "Had belanja"),
        h("p", { class: "muted" }, "Amaran lembut bila belanja capai 80% had, dan bila melebihi. Biarkan 0 kalau tak mahu had."),
        h("div", { class: "row" }, field("Had sehari (RM)", "harian", { type: "number", step: "0.01", value: s.belanjaHad?.harian || 0 }), field("Had sebulan (RM)", "bulanan", { type: "number", step: "0.01", value: s.belanjaHad?.bulanan || 0 })),
      ], (f) => ({
        name: f.get("name"), zone: f.get("zone").toUpperCase(), lat: Number(f.get("lat")), lon: Number(f.get("lon")),
        belanjaHad: { harian: Math.max(0, Number(f.get("harian")) || 0), bulanan: Math.max(0, Number(f.get("bulanan")) || 0) },
      })),

      tema: () => temaPage(s, save),

      sambungan: () => sambunganPage(),

      otak: () => h("div", { class: "stack" }, formOf([
        sw("aiEnabled", "Guna otak kedua", s.aiEnabled, "Bila dimatikan, Asbab hanya jawab dari catatan sendiri (mod tanpa AI)."),
        sw("askBeforeAI", "Minta izin sebelum guna otak kedua", s.askBeforeAI),
        h("p", { class: "muted" }, "Penyedia (Gemini, Claude, OpenAI), model, had harian setiap penyedia, peranan Chat/Coding dan susunan sandaran diatur dalam Tetapan > Sambungan dan API."),
      ], (f) => ({ aiEnabled: f.get("aiEnabled") === "on", askBeforeAI: f.get("askBeforeAI") === "on" })),
        h("a", { class: "btn", href: "#/tetapan/sambungan" }, "Buka Sambungan dan API")),

      suara: () => h("div", { class: "stack" }, reminderStatus(), bunyiPanel(s, save), masjidPanel(s, save), formOf([
        field("Mod Bilal: ingatkan berapa minit sebelum waktu", "bilalLead", { type: "number", value: s.bilalLead }),
        h("p", { class: "muted" }, "Mod Bilal dan pertanyaan \"Dah solat?\" tetap berbunyi semasa waktu senyap. Taklimat dan check-in tidak."),
        h("div", { class: "row" }, field("Taklimat pagi", "briefTime", { type: "time", value: s.briefTime }), field("Check-in petang", "checkinTime", { type: "time", value: s.checkinTime })),
        h("div", { class: "row" }, field("Waktu senyap dari", "quietFrom", { type: "time", value: s.quietFrom }), field("hingga", "quietTo", { type: "time", value: s.quietTo })),
        field("Maksimum check-in sehari", "maxProactive", { type: "number", value: s.maxProactive }),
        field("Keutamaan (satu baris satu, paling penting di atas)", "priorities", { tag: "textarea", rows: 5, value: s.priorities.join("\n") }),
      ], (f) => ({
        bilalLead: Number(f.get("bilalLead")), briefTime: f.get("briefTime"), checkinTime: f.get("checkinTime"),
        quietFrom: f.get("quietFrom"), quietTo: f.get("quietTo"), maxProactive: Number(f.get("maxProactive")),
        priorities: f.get("priorities").split("\n").map((x) => x.trim()).filter(Boolean),
      }))),

      personaliti: () => formOf([
        h("p", { class: "muted" }, "Cara Asbab bercakap dan nilai yang dia pegang. Kekal sama walaupun model AI ditukar."),
        field("Fail personaliti", "personality", { tag: "textarea", rows: 12, value: s.personality }),
      ], (f) => ({ personality: f.get("personality") })),

      akses: () => aksesPage(s, save),

      butang: () => butangPage(s, save),

      data: () => dataPage(s, save),

      keselamatan: () => {
        const k = s.kunci || { on: true, minit: 3 };
        return h("div", { class: "kad stack" },
          h("label", { class: "toggle" }, h("span", {}, "Kunci dengan cap jari / PIN", h("span", { class: "muted", style: { display: "block" } }, "Diminta bila Asbab dibuka, atau kembali dari latar belakang selepas tempoh di bawah. Guna kunci telefon sendiri; Asbab tak simpan PIN.")),
            h("input", { type: "checkbox", checked: k.on !== false, onchange: async (e) => { await save({ kunci: { ...k, on: e.target.checked } }); k.on = e.target.checked; } })),
          field("Kunci semula selepas di latar belakang", "minit", { tag: "select", value: String(k.minit ?? 3), options: [["0", "Serta-merta"], ["1", "1 minit"], ["3", "3 minit"], ["5", "5 minit"], ["10", "10 minit"], ["30", "30 minit"]] }),
          h("button", { class: "btn", onclick: async (e) => { const v = Number(e.target.closest(".kad").querySelector("select").value); await save({ kunci: { ...k, minit: v } }); k.minit = v; } }, "Simpan tempoh"),
          h("p", { class: "muted" }, "Semua data Asbab disimpan dalam telefon ini sahaja. Key disulitkan dengan Android Keystore."));
      },

      tentang: async () => {
        const { devlog } = await A.api("notes");
        const crash = await Upgrades.errorLog();
        return h("div", { class: "stack" }, updatePanel(),
          h("div", { class: "panel stack" }, h("h3", {}, "Laporan crash"),
            crash ? h("pre", { class: "log-ralat" }, crash.slice(-1500)) : h("p", { class: "muted" }, "Tiada crash atau ralat direkod."),
            crash ? h("div", { class: "row" },
              h("button", { class: "btn utama", onclick: () => Upgrades.newRequest(null, { text: "Baiki bug ini", log: crash }) }, "Baiki bug"),
              h("button", { class: "btn", onclick: async () => { await Native.crashClear(); localStorage.removeItem("asbab:ralat"); route(); } }, "Kosongkan")) : null),
          h("div", { class: "panel" }, h("h3", {}, "Log perkembangan"),
          ...devlog.map((d) => h("div", { class: "note" }, h("span", { class: "jenis" }, new Date(d.ts).toLocaleDateString("ms-MY")), h("span", { class: "tajuk" }, d.text)))));
      },
    };
    page.append(await P[cat]());
  }

  // Wallpaper dan rupa (Phase 6, laid out like the preview in 6.2): ready themes, own colours, font,
  // wallpaper per section, blur/dim/glass, movement.
  let wallSec = "semua";
  function temaPage(s, save) {
    const box = h("div", {});
    const paint = () => {
      const tm = Theme.get();
      if (!tm.asing) wallSec = "semua";
      const slider = (key, label, min, max, unit) => h("label", { class: "slider" }, h("span", {}, `${label}: ${tm[key]}${unit}`),
        h("input", { type: "range", min, max, value: tm[key], oninput: (e) => { Theme.set({ [key]: Number(e.target.value) }); e.target.previousSibling.textContent = `${label}: ${e.target.value}${unit}`; } }));
      const cur = Theme.colours();
      const custom = tm.custom || { mode: "gelap", bg: cur.bg, glow1: cur.glow1, glow2: cur.glow2, aksen: cur.aksen };
      const colour = (key, label) => h("label", {}, label, h("input", { type: "color", value: custom[key], onchange: (e) => {
        Theme.set({ preset: "custom", custom: { ...custom, [key]: e.target.value } }); A.toast("Disimpan"); paint();
      } }));
      const swatch = (id, p, label) => h("button", {
        class: `tema${tm.preset === id ? " dipilih" : ""}`, "aria-label": `Tema ${label}`,
        onclick: () => { Theme.set({ preset: id }); buzz(8); A.toast(`Tema ${label}`); paint(); },
      }, h("span", { class: "contoh", style: { background: `radial-gradient(circle at 25% 25%, ${p.glow1}, transparent 60%), radial-gradient(circle at 80% 80%, ${p.glow2}, transparent 55%), ${p.bg}` } },
        h("b", { style: { background: p.aksen } })), label);
      const w = (tm.asing && tm.wall[wallSec]) || tm.wall.semua || { jenis: "gradien" };
      const setWall = (wall) => { Theme.setWall(wallSec, wall); paint(); };
      const preview = w.jenis === "gambar" && w.img ? `url("${w.img}")`
        : w.jenis === "alam" ? "linear-gradient(#1b2547,#070b1a)"
        : `radial-gradient(circle at 25% 25%, ${cur.glow1}, transparent 60%), radial-gradient(circle at 80% 80%, ${cur.glow2}, transparent 55%), linear-gradient(${cur.bg}, ${cur.bg})`;
      box.replaceChildren(
        h("div", { class: "label-kumpulan" }, "Tema siap"),
        h("div", { class: "tema-grid" },
          ...Object.entries(Theme.PRESETS).map(([id, p]) => swatch(id, p, p.nama)),
          swatch("auto", { ...(matchMedia("(prefers-color-scheme: dark)").matches ? Theme.PRESETS.aurora : Theme.PRESETS.cerah) }, "Ikut telefon")),
        h("div", { class: "label-kumpulan" }, "Warna sendiri"),
        h("div", { class: "kad" },
          h("div", { class: "warna-row" }, colour("aksen", "Aksen"), colour("bg", "Latar"), colour("glow1", "Cahaya 1"), colour("glow2", "Cahaya 2")),
          h("label", { class: "toggle", style: { borderBottom: 0, paddingBottom: 0 } }, h("span", {}, "Teks gelap (untuk latar cerah)"), h("input", { type: "checkbox", checked: custom.mode === "cerah", onchange: (e) => {
            Theme.set({ preset: "custom", custom: { ...custom, mode: e.target.checked ? "cerah" : "gelap" } }); paint();
          } }))),
        h("div", { class: "label-kumpulan" }, "Fon"),
        h("div", { class: "fon-pilih" }, ...Object.entries(Theme.FONTS).map(([id, f]) => h("button", {
          class: tm.font === id ? "dipilih" : "", style: { fontFamily: f.css }, onclick: () => { Theme.set({ font: id }); A.toast("Disimpan"); paint(); },
        }, f.nama))),
        h("div", { class: "label-kumpulan" }, "Wallpaper gambar"),
        h("div", { class: "kad" },
          h("div", { class: "seksyen-pilih" }, ...Theme.SECTIONS.map(([sec, label]) => h("button", {
            class: wallSec === sec ? "dipilih" : "",
            // Choosing one section turns on "different wallpaper per section".
            onclick: () => { wallSec = sec; if (sec !== "semua" && !tm.asing) Theme.set({ asing: true }); paint(); },
          }, label))),
          h("div", { class: "gambar-pilih" },
            h("span", { class: "pra", style: { backgroundImage: preview } }),
            h("div", { class: "pilihan-gambar" },
              h("label", { class: `cip${w.jenis === "gambar" ? " dipilih" : ""}` }, "Pilih gambar dari galeri",
                h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
                  const file = e.target.files[0]; if (!file) return;
                  try {
                    const img = await Theme.compress(file);
                    if (!Theme.setWall(wallSec, { jenis: "gambar", img })) alert("Storan peranti penuh. Cuba gambar lain atau kurangkan bilangan wallpaper berbeza.");
                    else A.toast("Disimpan");
                    paint();
                  } catch (err) { alert(err.message); }
                } })),
              h("button", { class: `cip${w.jenis === "gradien" ? " dipilih" : ""}`, onclick: () => setWall({ jenis: "gradien" }) }, "Guna latar tema"),
              h("button", { class: `cip${w.jenis === "alam" ? " dipilih" : ""}`, onclick: () => setWall({ jenis: "alam" }) }, "Alam bulan"))),
          tm.asing ? h("label", { class: "toggle", style: { borderBottom: 0 } }, h("span", {}, "Wallpaper berbeza ikut bahagian"),
            h("input", { type: "checkbox", checked: true, onchange: (e) => { Theme.set({ asing: e.target.checked }); paint(); } })) : null,
          slider("blur", "Kabur", 0, 30, "px"), slider("gelap", "Gelap", 0, 80, "%"), slider("kaca", "Ketebalan kaca", 0, 100, "%")),
        h("div", { class: "label-kumpulan" }, "Gerakan dan bunyi"),
        h("div", { class: "kad" },
          h("label", { class: "toggle" }, h("span", {}, "Kesan latar bergerak", h("span", { class: "kecil", style: { display: "block" } }, "Alam hidup, daun, kunang-kunang. Lalai mati, untuk jimat bateri.")),
            h("input", { type: "checkbox", checked: s.animations === "penuh", onchange: async (e) => {
              const ns = await save({ animations: e.target.checked ? "penuh" : "ringan" });
              document.body.classList.toggle("ringan", ns.animations === "ringan");
              Object.assign(s, ns);
            } })),
          h("label", { class: "toggle", style: { borderBottom: 0 } }, h("span", {}, "Bunyi angin malam"), h("input", { type: "checkbox", checked: s.sound, onchange: async (e) => {
            const ns = await save({ sound: e.target.checked });
            ns.sound ? A.Ambient.start() : A.Ambient.stop();
            Object.assign(s, ns);
          } }))),
        h("p", { class: "kecil", style: { marginTop: "8px" } }, "Saiz teks ikut tetapan saiz fon telefon."));
    };
    paint();
    return box;
  }

  /* ---------- Sambungan dan API (Phase 3) ---------- */
  function sambunganPage() {
    const box = h("div", { class: "stack" });
    let cfg = Ai.config(A.boot.settings);
    const persist = async () => {
      const d = await A.api("settings", { method: "PUT", body: { ai: cfg } });
      A.boot.settings = d.settings;
      cfg = Ai.config(d.settings);
    };
    const lampOf = (ok) => h("span", { class: `lampu${ok ? " ok" : ""}` });

    const providerCard = (p, keys, usage) => {
      const c = cfg.providers[p.id];
      const res = h("p", { class: "muted", role: "status" });
      const raw = h("p", { class: "muted", style: { fontSize: ".8rem", wordBreak: "break-word" } });
      const lamp = lampOf(keys[p.id] && c.on);
      // detail = what the provider itself said (e.g. Google's error), so Amin can see the real cause.
      const say = (ok, text, detail = "") => {
        res.className = ok ? "ok-teks" : "err"; res.textContent = text;
        raw.textContent = detail ? `Mesej daripada ${p.label}: ${detail}` : "";
        lamp.classList.toggle("ok", !!ok); lamp.classList.toggle("merah", !ok);
      };
      const busy = (text) => {
        res.className = "muted"; raw.textContent = "";
        const t0 = Date.now();
        res.textContent = text;
        const tick = setInterval(() => { if (!res.isConnected || !res.textContent.startsWith(text)) return clearInterval(tick); res.textContent = `${text} ${Math.round((Date.now() - t0) / 1000)} saat`; }, 1000);
        return () => clearInterval(tick);
      };
      const keyIn = h("input", { type: "password", autocomplete: "off", placeholder: keys[p.id] ? "•••••••• (disimpan). Tampal baharu untuk tukar" : p.keyHint, "aria-label": `Key ${p.label}` });
      const opt = (v, cur) => h("option", { value: v, selected: v === cur }, v || "(pilih model)");
      const chatSel = h("select", { "aria-label": `Model Chat ${p.label}`, onchange: async () => { c.chatModel = chatSel.value; await persist(); } }, opt(c.chatModel, c.chatModel));
      const codeSel = h("select", { "aria-label": `Model Coding ${p.label}`, onchange: async () => { c.codingModel = codeSel.value; await persist(); } }, opt(c.codingModel, c.codingModel));
      const loadModels = async (auto) => {
        const stop = busy("Memuat senarai model…");
        const r = await Native.aiListModels(p.id);
        stop();
        if (!r.ok) { say(false, `Gagal memuat senarai model: ${r.detail}`, r.raw); return false; }
        if (auto || !c.chatModel) c.chatModel = r.chat || c.chatModel;
        if (auto || !c.codingModel) c.codingModel = r.coding || c.codingModel;
        const list = [...new Set([...(r.models || []), c.chatModel, c.codingModel].filter(Boolean))];
        chatSel.replaceChildren(...list.map((m) => opt(m, c.chatModel)));
        codeSel.replaceChildren(...list.map((m) => opt(m, c.codingModel)));
        await persist();
        res.className = "muted";
        res.textContent = `${list.length} model tersedia. Dipilih: Chat ${c.chatModel || "-"}, Coding ${c.codingModel || "-"}.${r.lite ? ` Paling laju: ${r.lite}.` : ""}`;
        return true;
      };
      const test = async () => {
        if (!c.chatModel && !(await loadModels(true))) return;
        const stop = busy(`Menguji ${c.chatModel}…`);
        const r = await Native.aiTest(p.id, c.chatModel);
        stop();
        if (r.ok && r.switchTo) {
          c.chatModel = r.switchTo;
          if (![...chatSel.options].some((o) => o.value === r.switchTo)) chatSel.append(opt(r.switchTo, r.switchTo));
          chatSel.value = r.switchTo;
          await persist();
        }
        say(r.ok, (r.ok ? "Berjaya: " : "Gagal: ") + r.detail, r.ok && !r.switchTo ? "" : r.raw);
      };
      return h("div", { class: "panel stack" },
        h("div", { class: "row" }, h("h3", { style: { flex: 1 } }, lamp, p.label),
          h("label", { class: "toggle", style: { margin: 0 } }, h("span", {}, c.on ? "On" : "Off"),
            h("input", { type: "checkbox", checked: c.on, "aria-label": `${p.label} on/off`, onchange: async (e) => { c.on = e.target.checked; await persist(); paint(); } }))),
        h("p", { class: "muted" }, p.help),
        keyIn,
        h("div", { class: "row" },
          h("button", { class: "btn utama", onclick: async () => {
            const v = keyIn.value.trim();
            if (!v) { say(false, "Tampal key dulu."); return; }
            try {
              await Native.secretSet(p.id, v);
              keyIn.value = ""; keyIn.placeholder = "•••••••• (disimpan). Tampal baharu untuk tukar";
              A.boot = await A.api("bootstrap");
              buzz(15);
              if (await loadModels(!c.chatModel)) await test();
            } catch (e) { say(false, e.message); }
          } }, "Simpan"),
          h("button", { class: "btn", disabled: !keys[p.id], onclick: () => loadModels(false) }, "Muat senarai model"),
          h("button", { class: "btn", disabled: !keys[p.id], onclick: test }, "Uji sambungan"),
          keys[p.id] ? h("button", { class: "btn bahaya", onclick: async () => {
            if (!confirm(`Padam key ${p.label} daripada telefon ini?`)) return;
            await Native.secretSet(p.id, ""); A.boot = await A.api("bootstrap"); paint();
          } }, "Padam key") : null),
        h("label", { class: "f" }, "Model untuk Chat", chatSel),
        h("label", { class: "f" }, "Model untuk Coding (project kod)", codeSel),
        h("label", { class: "f" }, `Had sehari untuk ${p.label} (hari ini: ${(usage.by || {})[p.id] || 0})`,
          h("input", { type: "number", min: 0, value: c.cap, onchange: async (e) => { c.cap = Math.max(0, Number(e.target.value) || 0); await persist(); } })),
        h("label", { class: "toggle" }, h("span", {}, "Hantar notifikasi peribadi kepada AI",
          h("span", { class: "muted", style: { display: "block" } }, "Lalai MATI. Bila mati, notifikasi WhatsApp, email, SMS dan bank hanya diproses oleh otak sendiri, dan tak pernah dihantar kepada penyedia ini.")),
          h("input", { type: "checkbox", checked: c.personal, onchange: async (e) => {
            if (e.target.checked && p.privacy && !confirm(`${p.privacy}\n\nHidupkan juga?`)) { e.target.checked = false; return; }
            c.personal = e.target.checked; await persist();
          } })),
        p.privacy ? h("p", { class: "muted" }, `⚠️ ${p.privacy}`) : null,
        res, raw);
    };

    const rolesCard = () => {
      const names = Ai.PROVIDERS.map((p) => [p.id, p.label]);
      const sel = (role) => h("select", { onchange: async (e) => { cfg.roles[role] = e.target.value; await persist(); } },
        ...names.map(([id, label]) => h("option", { value: id, selected: cfg.roles[role] === id }, label)));
      const order = h("div", { class: "stack" }, ...cfg.order.map((id, i) => h("div", { class: "row" },
        h("span", { style: { flex: 1 } }, `${i + 1}. ${Ai.byId(id).label}${cfg.providers[id].on ? "" : " (off)"}`),
        h("button", { class: "btn", disabled: i === 0, "aria-label": "Naikkan", onclick: async () => { [cfg.order[i - 1], cfg.order[i]] = [cfg.order[i], cfg.order[i - 1]]; await persist(); paint(); } }, "↑"),
        h("button", { class: "btn", disabled: i === cfg.order.length - 1, "aria-label": "Turunkan", onclick: async () => { [cfg.order[i + 1], cfg.order[i]] = [cfg.order[i], cfg.order[i + 1]]; await persist(); paint(); } }, "↓"))));
      return h("div", { class: "panel stack" },
        h("h3", {}, "Peranan dan susunan sandaran"),
        h("label", { class: "f" }, "Penyedia untuk Chat", sel("chat")),
        h("label", { class: "f" }, "Penyedia untuk Coding (project kod)", sel("coding")),
        h("p", { class: "muted" }, "Kalau penyedia utama gagal atau kena had, Asbab cuba penyedia seterusnya yang hidup ikut susunan ini. Kalau semua gagal, Asbab jawab dengan otak sendiri dan beritahu kau."),
        order);
    };

    const githubCard = (keys) => {
      const res = h("p", { class: "muted", role: "status" });
      const lamp = lampOf(keys.github);
      const input = h("input", { type: "password", autocomplete: "off", placeholder: keys.github ? "•••••••• (disimpan). Tampal baharu untuk tukar" : "Token GitHub (bermula dengan github_pat_)", "aria-label": "Token GitHub" });
      const test = async () => {
        res.className = "muted"; res.textContent = "Menguji…";
        const r = await Native.testGithub();
        res.className = r.ok ? "ok-teks" : "err"; res.textContent = (r.ok ? "Berjaya: " : "Gagal: ") + r.detail;
        lamp.classList.toggle("ok", !!r.ok); lamp.classList.toggle("merah", !r.ok);
      };
      return h("div", { class: "panel stack" },
        h("h3", {}, lamp, "GitHub (update, project kod, backup)"),
        input,
        h("p", { class: "muted" }, "Buat fine-grained token di github.com > Settings > Developer settings. Lihat PANDUAN.md untuk kebenaran yang perlu."),
        // Phase 7.2: what the token needs for Asbab to upgrade itself.
        h("details", {}, h("summary", { class: "kecil" }, "Panduan kebenaran token untuk upgrade diri"),
          h("ol", { class: "kecil", style: { paddingLeft: "1.2em" } },
            h("li", {}, "Buka github.com > Settings > Developer settings > Fine-grained tokens, kemudian Edit token Asbab (atau buat baharu)."),
            h("li", {}, "Repository access: pilih repo asbab (dan repo backup)."),
            h("li", {}, "Permissions > Repository: Contents: Read and write; Pull requests: Read and write; Issues: Read and write; Actions: Read and write; Workflows: Read and write; Metadata: Read-only."),
            h("li", {}, "Simpan, kemudian tampal token di sini (kalau token baharu) dan tekan Uji."),
            h("li", {}, "Actions diperlukan untuk lihat binaan dan Patah balik; Workflows diperlukan bila permintaan menyentuh fail workflow."))),
        h("div", { class: "row" },
          h("button", { class: "btn utama", onclick: async () => {
            if (!input.value.trim()) return;
            await Native.secretSet("github", input.value.trim()); input.value = "";
            A.boot = await A.api("bootstrap"); await test();
          } }, "Simpan"),
          h("button", { class: "btn", disabled: !keys.github, onclick: test }, "Uji sambungan"),
          keys.github ? h("button", { class: "btn bahaya", onclick: async () => { if (confirm("Padam token GitHub?")) { await Native.secretSet("github", ""); A.boot = await A.api("bootstrap"); paint(); } } }, "Padam") : null),
        res);
    };

    const paint = async () => {
      const keys = await Native.secretStatus();
      const usage = await Native.aiUsage();
      cfg = Ai.config(A.boot.settings);
      box.replaceChildren(
        h("p", { class: "muted" }, "Otak kedua boleh guna beberapa AI. Setiap jawapan dilabel dengan AI yang digunakan. Key disimpan dalam telefon ini sahaja (Android Keystore), tak pernah dipaparkan semula, tak masuk ke backup dan tak masuk ke repo."),
        rolesCard(),
        ...Ai.PROVIDERS.map((p) => providerCard(p, keys, usage)),
        githubCard(keys));
    };
    paint();
    return box;
  }

  /* ---------- Akses Telefon (Phase 3) ---------- */
  function aksesPage(s, save) {
    const box = h("div", { class: "stack" });
    const T = [
      ["whatsapp", "Baca notifikasi WhatsApp"], ["email", "Baca notifikasi email (Gmail, Outlook)"],
      ["sms_bank", "Baca SMS dan notifikasi bank/e-wallet", "Jumlah seperti RM12.50 direkod sebagai belanja tanpa AI."],
      ["skrin", "Baca isi skrin app (lalai tutup)", "Hanya app di atas yang dihidupkan. Perlu juga suis Kebolehcapaian Android."],
      ["penggunaan_app", "Ringkasan penggunaan app harian", "Masuk ke taklimat pagi dan Catatan."],
    ];
    const card = (ok, title, desc, page) => h("div", { class: "panel stack" },
      h("h3", {}, h("span", { class: `lampu${ok ? " ok" : ""}` }), title),
      h("p", { class: "muted" }, desc),
      h("button", { class: ok ? "btn" : "btn utama", onclick: () => Native.openSettings(page) }, ok ? "Buka tetapan Android" : "Hidupkan dalam tetapan Android"));
    const paint = async () => {
      const st = await Native.accessStatus();
      const cur = A.boot.settings;
      if (st.browser) { box.replaceChildren(h("div", { class: "panel" }, "Akses telefon hanya berfungsi dalam app Android.")); return; }
      const form = h("form", { class: "panel stack", onsubmit: async (e) => {
        e.preventDefault();
        const f = new FormData(form);
        await save({
          access: Object.fromEntries(T.map(([k]) => [k, f.get(`acc_${k}`) === "on"])),
          blocklist: String(f.get("blocklist") || "").split("\n").map((x) => x.trim()).filter(Boolean),
          retentionDays: Math.min(30, Math.max(1, Number(f.get("retentionDays")) || 3)),
        });
        Native.serviceSync();
        setTimeout(paint, 600);
      } },
        h("h3", {}, "Apa yang Asbab boleh baca"),
        h("p", { class: "muted" }, "Semua yang dibaca hanya DATA. Asbab tak pernah balas mesej, hantar, berbelanja atau bertindak dalam app lain. App bank, e-wallet, pengurus kata laluan dan OTP tak pernah dibaca dari skrin, dan mesej yang mengandungi kod OTP/TAC tak disimpan."),
        ...T.map(([k, label, note]) => h("label", { class: "toggle" }, h("span", {}, label, note ? h("span", { class: "muted", style: { display: "block" } }, note) : null), h("input", { type: "checkbox", name: `acc_${k}`, checked: !!cur.access[k] }))),
        field("Orang atau kumpulan yang Asbab tak boleh baca (satu baris satu)", "blocklist", { tag: "textarea", rows: 4, value: (cur.blocklist || []).join("\n") }),
        field("Padam data mentah selepas berapa hari (1 hingga 30)", "retentionDays", { type: "number", value: cur.retentionDays || 3 }),
        h("div", { class: "row" }, h("button", { class: "btn utama", type: "submit" }, "Simpan")));
      box.replaceChildren(
        h("div", { class: "panel stack" },
          h("div", { class: "row" },
            h("h3", { style: { flex: 1 } }, st.paused ? "Asbab dijeda" : "Asbab aktif"),
            h("button", { class: st.paused ? "btn utama" : "btn bahaya", onclick: async () => { await Native.setPaused(!st.paused); buzz(25); paint(); } }, st.paused ? "Sambung Asbab" : "Jeda Asbab")),
          h("p", { class: "muted" }, st.paused ? "Tiada apa yang dibaca sekarang." : `Data mentah: ${st.ingestTotal} item (${st.ingestWaiting} menunggu disusun oleh otak kedua, paling kerap sejam sekali).`),
          st.ingestTotal ? h("button", { class: "btn", onclick: async () => { if (confirm("Padam semua data mentah sekarang? Catatan yang dah disusun kekal.")) { await Native.ingestClear(); paint(); } } }, "Padam data mentah sekarang") : null),
        form,
        h("h3", {}, "Kebenaran Android"),
        card(st.notificationListener, "Akses notifikasi", "Perlu untuk membaca notifikasi WhatsApp, email, SMS dan bank.", "notificationListener"),
        card(st.accessibility, "Kebolehcapaian (teks skrin)", "Pilihan. Cari \"Asbab: baca teks skrin\" dan hidupkan. Juga perlu untuk pintasan kunci skrin pada butang bulan.", "accessibility"),
        card(st.usage, "Akses penggunaan", "Untuk ringkasan penggunaan app harian. Pilih Asbab dan benarkan.", "usage"),
        card(st.overlay, "Papar di atas app lain", "Untuk butang bulan terapung (Fasa 4).", "overlay"),
        h("div", { class: "panel stack" }, h("h3", {}, "Bateri"),
          h("p", { class: "muted" }, "Supaya Asbab tak ditutup oleh telefon: Tetapan Android > Apps > Asbab > Bateri > Tiada sekatan. Panduan untuk Xiaomi, Oppo, Vivo dan Samsung ada dalam Tetapan > Bila Asbab Bersuara."),
          h("button", { class: "btn", onclick: () => Native.openSettings("battery") }, "Tetapan bateri")));
    };
    paint();
    Native.onResume?.(() => { if (box.isConnected) paint(); });
    return box;
  }

  /* ---------- Phase 6.1: Mod Bilal sound, azan, Mod Masjid, weekly summary ---------- */
  function bunyiPanel(s, save) {
    const box = h("div", { class: "kad stack" });
    const paint = () => {
      const b = { ...(s.bunyi || {}) };
      b.azan = { ...(b.azan || {}) };
      const put = async (patch) => { const ns = await save({ bunyi: { ...b, ...patch } }); Object.assign(s, ns); paint(); };
      const pick = async (kind) => {
        const r = await Native.pickAudio();
        if (!r || !r.uri) return;
        await put(kind === "azan" ? { azanUri: r.uri, azanNama: r.name } : { bilalUri: r.uri, bilalNama: r.name });
      };
      const vol = (key, label) => h("label", { class: "f" }, h("span", {}, `${label}: ${b[key] ?? 80}%`),
        h("input", { type: "range", min: 0, max: 100, value: b[key] ?? 80, onchange: (e) => put({ [key]: Number(e.target.value) }) }));
      const test = (kind) => h("button", { class: "btn kecil", onclick: async () => { try { await Native.soundTest(kind); } catch (e) { A.toast(e.message); } } }, "Cuba bunyi");
      box.replaceChildren(
        h("h3", {}, "Bunyi Mod Bilal"),
        h("div", { class: "row" }, h("span", { style: { flex: 1 } }, b.bilalUri ? (b.bilalNama || "Fail dipilih") : "Bunyi notifikasi telefon"),
          h("button", { class: "btn kecil", onclick: () => pick("bilal") }, "Pilih fail"),
          b.bilalUri ? h("button", { class: "btn kecil", onclick: () => put({ bilalUri: "", bilalNama: "" }) }, "Guna bunyi telefon") : null),
        vol("bilalVol", "Kelantangan"),
        h("label", { class: "toggle" }, h("span", {}, "Getar sahaja"), h("input", { type: "checkbox", checked: !!b.getarSahaja, onchange: (e) => put({ getarSahaja: e.target.checked }) })),
        h("div", { class: "row" }, test("bilal"), h("button", { class: "btn kecil", onclick: () => Native.soundStop() }, "Berhenti")),
        h("h3", {}, "Azan pada waktu masuk"),
        h("p", { class: "muted" }, "Guna fail azan yang kau pilih sendiri. Asbab tak membawa rakaman azan."),
        h("div", { class: "row" }, h("span", { style: { flex: 1 } }, b.azanUri ? (b.azanNama || "Fail dipilih") : "Belum dipilih"),
          h("button", { class: "btn kecil", onclick: () => pick("azan") }, "Pilih fail azan")),
        ...[["fajr", "Subuh"], ["dhuhr", "Zohor"], ["asr", "Asar"], ["maghrib", "Maghrib"], ["isha", "Isyak"]].map(([k, n]) => h("label", { class: "toggle" }, h("span", {}, n),
          h("input", { type: "checkbox", checked: !!b.azan[k], disabled: !b.azanUri, onchange: (e) => put({ azan: { ...b.azan, [k]: e.target.checked } }) }))),
        vol("azanVol", "Kelantangan azan"),
        h("div", { class: "row" }, b.azanUri ? test("azan") : null, h("button", { class: "btn kecil", onclick: () => Native.soundStop() }, "Berhenti")));
    };
    paint();
    return box;
  }

  function masjidPanel(s, save) {
    const m = { on: false, minit: 20, ...(s.masjid || {}) };
    return h("div", { class: "kad stack" },
      h("label", { class: "toggle" }, h("span", {}, "Mod Masjid", h("span", { class: "muted", style: { display: "block" } }, "Dari waktu masuk solat, Asbab senyap sepenuhnya kecuali Mod Bilal.")),
        h("input", { type: "checkbox", checked: m.on, onchange: async (e) => { m.on = e.target.checked; Object.assign(s, await save({ masjid: { ...m } })); } })),
      h("label", { class: "f" }, "Tempoh senyap (minit)", h("input", { type: "number", min: 5, max: 120, value: m.minit, onchange: async (e) => { m.minit = Math.min(120, Math.max(5, Number(e.target.value) || 20)); Object.assign(s, await save({ masjid: { ...m } })); } })),
      h("label", { class: "toggle" }, h("span", {}, "Ringkasan mingguan (Ahad 9 malam)", h("span", { class: "muted", style: { display: "block" } }, "Belanja minggu ni, solat yang belum ditanda, jadual minggu depan. Tanpa AI.")),
        h("input", { type: "checkbox", checked: s.ringkasanMingguan !== false, onchange: async (e) => Object.assign(s, await save({ ringkasanMingguan: e.target.checked })) })));
  }

  // Reminder health: notification permission, exact alarms, next alarm, test button, battery guidance.
  function reminderStatus() {
    const box = h("div", { class: "panel stack" }, h("h3", {}, "Status peringatan"), h("p", { class: "muted" }, "Menyemak…"));
    const row = (ok, label, fix) => h("div", { class: "row" },
      h("span", { class: `lampu${ok ? " ok" : ""}` }), h("span", { style: { flex: 1 } }, label), ok ? null : fix);
    const paint = async () => {
      const st = await Native.status();
      if (st.browser) { box.replaceChildren(h("h3", {}, "Status peringatan"), h("p", { class: "muted" }, "Peringatan hanya berfungsi dalam app Android.")); return; }
      const next = st.next && st.next.at ? `${st.next.atText}${st.next.title ? " · " + st.next.title : ""}` : "belum dijadualkan";
      const res = h("p", { class: "muted", role: "status" });
      box.replaceChildren(
        h("h3", {}, "Status peringatan"),
        row(st.notifications, st.notifications ? "Notifikasi dibenarkan" : "Notifikasi belum dibenarkan",
          h("button", { class: "btn utama", onclick: async () => { if (!(await Native.requestNotifications())) Native.openSettings("notifications"); setTimeout(paint, 800); } }, "Benarkan")),
        row(st.exactAlarms, st.exactAlarms ? "Alarm tepat dibenarkan" : "Alarm tepat belum dibenarkan (Mod Bilal mungkin lewat)",
          h("button", { class: "btn", onclick: () => Native.openSettings("exactAlarm") }, "Buka tetapan")),
        h("p", { class: "muted" }, `Peringatan seterusnya: ${next}`),
        st.next && st.next.missingPrayer ? h("p", { class: "err" }, "Waktu solat belum dapat diambil daripada JAKIM. Asbab cuba lagi setiap jam bila ada internet.") : null,
        h("div", { class: "row" },
          h("button", { class: "btn", onclick: async () => { await Native.testBilal(10); res.textContent = "Notifikasi ujian akan muncul dalam 10 saat. Kau boleh tutup app untuk uji."; } }, "Cuba Mod Bilal"),
          h("button", { class: "btn", onclick: () => Native.openSettings("battery") }, "Tetapan bateri")),
        res,
        h("details", {}, h("summary", {}, "Telefon Xiaomi, Oppo, Vivo atau Samsung?"),
          h("p", { class: "muted" }, "Sesetengah jenama menutup app di latar belakang untuk jimat bateri, jadi peringatan boleh lewat. Buka Tetapan bateri dan pilih \"Tidak dioptimumkan\" atau \"Tiada sekatan\" untuk Asbab."),
          h("p", { class: "muted" }, "Xiaomi: Tetapan > Apps > Asbab > Autostart (hidupkan) dan Penjimat bateri > Tiada sekatan."),
          h("p", { class: "muted" }, "Oppo/Realme: Tetapan > Bateri > Asbab > Benarkan aktiviti latar belakang dan Auto-launch."),
          h("p", { class: "muted" }, "Vivo: i Manager > Pengurus app > Autostart > Asbab, dan Bateri > Penggunaan kuasa latar belakang tinggi."),
          h("p", { class: "muted" }, "Samsung: Tetapan > Penjagaan peranti > Bateri > Had penggunaan latar belakang > keluarkan Asbab daripada senarai app tidur.")));
    };
    paint();
    return box;
  }

  // Update check: compare this app with the newest GitHub Release.
  function updatePanel() {
    const res = h("p", { class: "muted", role: "status" });
    const actions = h("div", { class: "row" });
    const check = async () => {
      res.textContent = "Menyemak…";
      actions.replaceChildren();
      const u = await Native.checkUpdate();
      if (!u.ok) {
        res.textContent = u.message;
        actions.append(h("button", { class: "btn", onclick: () => Native.openUrl(Native.releasesUrl) }, "Buka halaman Release"));
        return;
      }
      if (!u.available) { res.textContent = `Asbab dah versi terkini (${u.current}).`; return; }
      res.textContent = `Versi baharu ${u.latest} ada (kau guna ${u.current}).`;
      // Phase 7.2: backup to the backup repo first, then Android's install screen.
      actions.append(h("button", { class: "btn utama", onclick: () => (u.apkApi ? Upgrades.installWithBackup(u.apkApi, `Pasang ${u.latest}`) : Native.openUrl(u.apkUrl || u.pageUrl)) }, "Pasang kemas kini"));
    };
    return h("div", { class: "panel stack" },
      h("h3", {}, `Asbab versi ${A.boot.version}`),
      h("button", { class: "btn", onclick: check }, "Semak update"), res, actions);
  }

  // Phase 7.1: shared with projectui.js (project pages are built there now).
  window.Views = { today, orbit, project, notes, settings, sheetForm, field, editProject, proposeChange, generateChange, showProposal, CHANGE, addBelanja, addJadual };
})();
