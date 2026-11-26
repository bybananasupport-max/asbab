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
  async function today(view) {
    Scene.setScene("bukit");
    const wrap = h("div", { class: "wrap stack" }, h("p", { class: "muted" }, "Memuat hari kau…"));
    view.append(wrap);
    let t, all;
    try { [t, { notes: all }] = await Promise.all([A.api("today"), A.api("notes")]); A.today = t; }
    catch (e) { wrap.replaceChildren(h("p", { class: "err" }, e.message)); return; }
    const pt = t.prayer;
    const hr = new Date().getHours();
    const salam = hr < 11 ? "Selamat pagi" : hr < 14 ? "Selamat tengah hari" : hr < 19 ? "Selamat petang" : "Selamat malam";
    wrap.replaceChildren(
      h("div", { class: "salam" }, h("h1", {}, `${salam}, ${A.boot.settings.name}`), h("p", { class: "muted" }, `${t.now.hari}, ${t.now.date}${pt?.hijri ? " · " + pt.hijri : ""}`)),
      pt ? h("div", { class: "hero stack" }, bilal(pt), solatGrid(t))
        : h("div", { class: "panel" }, `Waktu solat JAKIM (zon ${A.boot.settings.zone}) belum dapat diambil. Semak internet, atau semak kod zon dalam Tetapan > Profil.`),
      statGrid(t, all),
      weekCard(all, t.now.date));
    clearInterval(today.timer);
    today.timer = setInterval(() => { const b = $("#bilal"); if (b && pt && location.hash === "#/hari-ini") b.replaceWith(bilal(pt)); }, 30000);
  }

  function nextPrayer(pt) {
    const m = nowMin();
    for (const [k, n] of WAKTU) if (toMin(pt[k]) > m) return { k, n, time: pt[k], left: toMin(pt[k]) - m };
    const tm = A.today.prayerTomorrow || pt;
    return { k: "fajr", n: "Subuh esok", time: tm.fajr, left: 1440 - m + toMin(tm.fajr) };
  }

  function bilal(pt) {
    const nx = nextPrayer(pt);
    const lead = A.boot.settings.bilalLead;
    const angle = Math.max(-70, Math.min(70, (nx.left / 180) * 70 - 10));
    const siap = nx.left <= lead;
    return h("div", { id: "bilal", class: "menara" },
      h("div", { html: `<svg viewBox="0 0 120 90" aria-hidden="true">
        <path class="bayang" style="transform:rotate(${angle}deg)" d="M26 80 L34 80 L60 86 L4 86 Z"/>
        <g class="bangunan"><rect x="25" y="30" width="10" height="50"/><path d="M23 30 L30 14 L37 30 Z"/><circle cx="30" cy="11" r="2"/>
        <rect x="45" y="55" width="60" height="25"/><path d="M50 55 Q75 30 100 55 Z"/></g></svg>` }),
      h("div", {},
        h("p", { class: "muted" }, siap ? "Mod Bilal: masa bersiap" : "Solat seterusnya"),
        h("div", { class: "count" }, nx.n),
        h("p", {}, `${nx.time} · lagi ${nx.left >= 60 ? `${Math.floor(nx.left / 60)} jam ${nx.left % 60} minit` : `${nx.left} minit`}`),
        siap ? h("p", { class: "muted" }, "Dah mandi dan ambil wuduk?") : null));
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
    ], async (d) => { await A.api("notes", { method: "POST", body: { ...d, kind: "jadual" } }); route(); });
  }
  function addBelanja() {
    sheetForm("Rekod belanja", [
      field("Jumlah (RM)", "amount", { type: "number", step: "0.01", required: true }),
      field("Untuk apa", "title", { required: true, placeholder: "Nasi lemak" }),
    ], async (d) => { await A.api("notes", { method: "POST", body: { ...d, kind: "belanja", amount: Number(d.amount) } }); route(); });
  }

  function statGrid(t, all) {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return isoDay(d); });
    const belanja7 = days.map((d) => all.filter((n) => n.kind === "belanja" && n.date === d).reduce((a, n) => a + (n.amount || 0), 0));
    const next = t.jadual.find((j) => !j.time || toMin(j.time) >= nowMin());
    const used = A.boot.usage.count, cap = Ai.totalCap(A.boot.settings, A.boot.aiKeys || {});
    const sites = A.boot.projects.filter((p) => p.url && !p.archived);
    const down = sites.filter((p) => p.status === "down").length;
    const card = (label, nilai, extra, onclick, html) => h("button", { class: "gcard", style: { textAlign: "left", color: "inherit" }, onclick },
      h("span", { class: "label" }, label), h("span", { class: "nilai" }, nilai), extra ? h("span", { class: "label" }, extra) : null, html ? h("div", { html, style: { marginTop: "auto" } }) : null);
    return h("div", { class: "stat-grid" },
      card("Belanja hari ini", rm(t.belanjaTotal), "Tekan untuk rekod", addBelanja, spark(belanja7)),
      card("Jadual hari ini", String(t.jadual.length), next ? `Seterusnya: ${next.time || ""} ${next.title}` : "Tekan untuk tambah", () => addJadual()),
      card("Otak kedua", `${used}/${cap}`, "kali digunakan hari ini", () => (location.hash = "#/tetapan/otak")),
      card("Website", sites.length ? (down ? `${down} down` : "Semua ok") : "–", sites.length ? `${sites.length} dipantau` : "Tambah alamat dalam project", () => (location.hash = "#/project")));
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
    return h("div", { class: "panel stack" },
      h("div", { class: "row" }, h("h3", { style: { flex: 1 } }, "Minggu ini"), h("button", { class: "btn", onclick: () => addJadual(sel) }, "Tambah")),
      strip, list);
  }

  /* ================= PROJECT: MEDAN GRAVITI ================= */
  const COLOR = { kod: "#6fc2b0", biasa: "#a99be0" };
  const still = () => document.body.classList.contains("ringan") || matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function orbit(view) {
    const { projects } = await A.api("projects");
    A.boot.projects = projects;
    const listMode = localStorage.getItem("asbab:orbitList") === "1";
    const wrap = h("div", { class: "wrap stack" },
      h("div", { class: "row" }, h("h1", { style: { flex: 1 } }, "Project"),
        h("button", { class: "btn", onclick: () => { localStorage.setItem("asbab:orbitList", listMode ? "0" : "1"); route(); } }, listMode ? "Medan" : "Senarai"),
        h("button", { class: "btn utama", onclick: newProject }, "Project baru")));
    view.append(wrap);
    if (!projects.length) { wrap.append(h("div", { class: "panel" }, "Medan masih kosong. Tambah project pertama kau, contohnya Milogamingstore atau AI ROOM.")); return; }
    if (listMode) {
      wrap.append(h("div", { class: "panel" }, ...projects.map((p) => h("a", { href: `#/project/${p.id}`, class: "note", style: { color: "inherit", textDecoration: "none" } },
        h("span", { class: "jenis" }, p.type), h("span", { class: "tajuk" }, p.name),
        p.pending ? h("span", { class: "badge tinggi" }, "tunggu lulus") : null, p.status === "down" ? h("span", { class: "badge tinggi" }, "down") : null))));
      return;
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "garis");
    svg.setAttribute("aria-hidden", "true");
    const field = h("div", { class: "medan panel", "aria-label": "Medan graviti project" });
    const core = h("button", { class: "teras", "aria-label": "Teras Asbab: kembali ke semua project" }, "Asbab");
    field.append(svg, core);
    wrap.append(field, h("p", { class: "muted" }, "Seret dan lempar kad. Tekan kad untuk jadikan ia teras baharu. Tekan Asbab untuk kembali. Titik merah: tunggu kelulusan kau."));

    let W = field.clientWidth, H = field.clientHeight;
    const C = () => ({ x: W / 2, y: H / 2 });
    // Jarak sasaran dalam bentuk elips supaya muat skrin telefon yang tinggi.
    const RX = () => Math.max(60, W / 2 - 70), RY = () => Math.max(60, H / 2 - 40);
    const level = (p) => (p.archived ? 0.98 : p.pending || p.status === "down" ? 0.55 : 0.8);
    const targetR = (p) => Math.min(RX(), RY()) * level(p);
    const nodes = projects.map((p, i) => {
      const el = h("div", { class: `nod gcard${p.archived ? " arkib" : ""}${p.status === "down" ? " down" : ""}`, role: "button", tabindex: "0", "aria-label": `Project ${p.name}` },
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
        const s = h("button", { class: "satelit gcard", style: { animationDelay: i * 0.06 + "s", ...(color ? { boxShadow: `0 0 0 2px ${color}` } : {}) }, onclick: fn }, label);
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
          if (focus !== n && d < 120) { const push = (120 - d) * 0.05; n.vx += (dx / d) * push; n.vy += (dy / d) * push; } }
        for (const m of [...nodes, ...sats.map((el) => ({ x: parseFloat(el.style.left) || -999, y: parseFloat(el.style.top) || -999 }))]) {
          if (m === n || (focus === n && !m.p)) continue;
          const dx = n.x - m.x, dy = n.y - m.y, d = Math.hypot(dx, dy) || 1, min = 128;
          if (d < min) { const push = (min - d) * 0.025; n.vx += (dx / d) * push; n.vy += (dy / d) * push; }
        }
        if (!calm) { n.vx += Math.sin(t * 0.7 + n.seed) * 0.03; n.vy += Math.cos(t * 0.6 + n.seed) * 0.03; }
        n.vx *= 0.86; n.vy *= 0.86;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(64, Math.min(W - 64, n.x)); n.y = Math.max(30, Math.min(H - 30, n.y));
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
      field("Jenis", "type", { tag: "select", value: p.type, options: [["biasa", "Biasa"], ["kod", "Kod"]] }),
      field("Repo GitHub", "repo", { value: p.repo, placeholder: "username/nama-repo" }),
      field("Branch", "branch", { value: p.branch || "main" }),
      field("Alamat website", "url", { type: "url", value: p.url }),
      field("Orbit", "orbit", { tag: "select", value: p.orbit, options: [["dalam", "Dalam (aktif)"], ["luar", "Luar (jarang disentuh)"]] }),
    ], async (d) => { await A.api(`projects/${p.id}`, { method: "PATCH", body: d }); route(); });
  }

  async function proposeChange(p, task, work) {
    if (!A.boot.ai) { work.prepend(h("div", { class: "panel err" }, "Key Claude belum disimpan (Tetapan > Sambungan & API), jadi Asbab belum boleh mengubah kod.")); return; }
    if (!A.boot.github) { work.prepend(h("div", { class: "panel err" }, "Token GitHub belum disimpan (Tetapan > Sambungan & API), jadi Asbab belum boleh membaca repo.")); return; }
    const box = $("#msgs");
    box?.append(h("div", { class: "msg user baru-user" }, task));
    const status = h("p", { class: "muted" }, "Asbab sedang meneliti repo…");
    const stream = h("div", { class: "stream" });
    const panel = h("div", { class: "panel stack" }, h("h3", {}, "Asbab sedang bekerja"), status, h("div", { class: "diff-wrap" }, stream));
    work.replaceChildren(panel);
    p.working = true;
    try {
      const { files } = await A.api(`projects/${p.id}/files`);
      status.textContent = `Repo ada ${files.length} fail. Memilih fail yang berkaitan…`;
      const pick = await A.think({
        role: "coding", maxTokens: 400,
        system: "Kau memilih fail kod yang perlu dibaca untuk satu tugasan. Balas HANYA dengan JSON array laluan fail, maksimum 10.",
        prompt: `Tugasan: ${task}\n\nSenarai fail:\n${files.slice(0, 800).map((f) => f.path).join("\n")}`,
      });
      let paths = [];
      try { paths = JSON.parse(pick.match(/\[[\s\S]*\]/)[0]); } catch { paths = files.slice(0, 5).map((f) => f.path); }
      status.textContent = `Membaca ${paths.length} fail…`;
      const read = await A.api(`projects/${p.id}/read`, { method: "POST", body: { paths } });
      status.textContent = "Menulis cadangan perubahan…";
      const answer = await A.thinkFull({
        weight: "heavy", maxTokens: 16000,
        system: `Kau ialah Asbab, developer peribadi Amin untuk project "${p.name}". Amin belum boleh membaca kod, jadi penjelasan mesti dalam Bahasa Melayu yang mudah.
Tulis perubahan yang diperlukan sahaja, dan kekalkan gaya kod sedia ada. Jangan sesekali masukkan kunci rahsia dalam kod.
Format jawapan mesti TEPAT begini:
RINGKASAN: satu baris apa yang berubah
RISIKO: rendah atau sederhana atau tinggi
PENJELASAN: 2 hingga 5 ayat mudah tentang apa yang akan berubah, kenapa, dan apa yang perlu Amin semak selepas naik
=== FILE: laluan/fail ===
(kandungan penuh fail baharu, tanpa markdown fence)
=== END FILE ===
Ulang blok FILE untuk setiap fail yang berubah. Tulis kandungan PENUH setiap fail.`,
        prompt: `Tugasan: ${task}\n\nFail semasa:\n${read.files.map((f) => `### ${f.path}\n${f.content}`).join("\n\n")}`,
      }, (t) => { stream.textContent = t.slice(-3000); stream.scrollTop = 1e9; });
      const raw = answer.text;
      const parsed = parseProposal(raw);
      if (!parsed.files.length) throw new Error("Cadangan tak mengandungi fail dalam format yang betul. Cuba minta sekali lagi dengan lebih spesifik.");
      await A.api(`projects/${p.id}/proposal`, { method: "POST", body: { task, ...parsed, provider: answer.provider, fallback: answer.fallback } });
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
  async function notes(view) {
    Scene.setScene("sungai");
    const { notes: all, devlog } = await A.api("notes");
    const tab = localStorage.getItem("asbab:tab") || "pustaka";
    const tabs = [["pustaka", "Pustaka"], ["idea", "Bank Idea"], ["belanja", "Belanja"], ["perkembangan", "Perkembangan Asbab"]];
    const body = h("div", { class: "stack" });
    view.append(h("div", { class: "wrap stack" },
      h("div", { class: "row" }, h("h1", { style: { flex: 1 } }, "Catatan"),
        h("button", { class: "btn utama", onclick: () => sheetForm("Catatan baru", [
          field("Jenis", "kind", { tag: "select", value: "nota", options: [["nota", "Nota"], ["jadual", "Jadual"], ["idea", "Idea"], ["makan", "Makan"], ["belanja", "Belanja"]] }),
          field("Tajuk", "title", { required: true }),
          field("Butiran", "text", { tag: "textarea", rows: 3 }),
          field("Tarikh", "date", { type: "date", value: todayISO() }),
          field("Masa", "time", { type: "time" }),
          field("Jumlah RM (untuk belanja)", "amount", { type: "number", step: "0.01" }),
        ], async (d) => { await A.api("notes", { method: "POST", body: { ...d, amount: d.amount ? Number(d.amount) : undefined } }); route(); }) }, "Tambah")),
      h("div", { class: "tabs", role: "tablist" }, ...tabs.map(([id, label]) => h("button", { role: "tab", "aria-selected": String(id === tab), class: id === tab ? "aktif" : "", onclick: () => { localStorage.setItem("asbab:tab", id); route(); } }, label))),
      body));
    if (tab === "pustaka") pustaka(body, all);
    if (tab === "idea") ideaSky(body, all.filter((n) => n.kind === "idea"));
    if (tab === "belanja") belanjaList(body, all.filter((n) => n.kind === "belanja"));
    if (tab === "perkembangan") body.append(h("div", { class: "panel" }, ...devlog.map((d) => h("div", { class: "note" }, h("span", { class: "jenis" }, new Date(d.ts).toLocaleDateString("ms-MY")), h("span", { class: "tajuk" }, d.text)))));
  }

  function noteRow(n) {
    return h("div", { class: "note" },
      h("span", { class: "jenis" }, n.kind), h("span", { class: "tajuk" }, `${n.time ? n.time + "  " : ""}${n.title}${n.amount ? "  " + rm(n.amount) : ""}`),
      h("button", { "aria-label": `Padam ${n.title}`, onclick: async (e) => { await A.api(`notes/${n.id}`, { method: "DELETE" }); e.target.closest(".note").remove(); } }, "×"));
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
  const CATS = [
    ["profil", "👤", "Profil", "nama zon solat lokasi cuaca"],
    ["tema", "🖼️", "Wallpaper & Tema", "wallpaper gambar blur kaca gelap cerah warna aksen animasi bunyi"],
    ["sambungan", "🔌", "Sambungan & API", "api key gemini claude openai model github token sandaran uji"],
    ["otak", "🧠", "Otak Kedua", "ai claude had izin penggunaan model"],
    ["suara", "🔔", "Bila Asbab Bersuara", "bilal solat taklimat pagi check-in petang waktu senyap keutamaan"],
    ["personaliti", "💬", "Personaliti", "personaliti cara bercakap nilai"],
    ["akses", "📱", "Akses Telefon", "toggle suis whatsapp email sms bank skrin fail senarai blok simpan"],
    ["butang", "🌙", "Butang Terapung", "butang bulan jalur kedudukan terapung kamera lampu kunci"],
    ["data", "💾", "Data & Backup", "backup eksport pulih identiti"],
    ["keselamatan", "🔒", "Keselamatan", "cap jari pin kunci"],
    ["tentang", "ℹ️", "Tentang Asbab", "versi update kemas kini log perkembangan"],
  ];

  function summary(id, s) {
    const tm = Theme.get();
    return {
      profil: `${s.name} · zon ${s.zone}`,
      tema: `${tm.asing ? "Wallpaper ikut bahagian" : (tm.wall.semua?.jenis === "gambar" ? "Gambar sendiri" : "Alam hidup")} · blur ${tm.blur}`,
      sambungan: `Chat: ${Ai.byId(Ai.config(s).roles.chat).label} · ${Ai.IDS.filter((id) => (A.boot.aiKeys || {})[id]).length} AI ada key · GitHub ${A.boot.github ? "ada" : "belum"}`,
      otak: s.aiEnabled ? `Hidup · ${A.boot.usage.count} permintaan hari ini` : "Dimatikan (mod tanpa AI)",
      suara: `Mod Bilal ${s.bilalLead} minit · taklimat ${s.briefTime} · senyap ${s.quietFrom}-${s.quietTo}`,
      personaliti: s.personality.slice(0, 60) + "…",
      akses: `${["whatsapp", "email", "sms_bank", "skrin", "penggunaan_app"].filter((k) => s.access[k]).length} daripada 5 suis hidup`,
      butang: s.bubble ? "Terapung di atas app lain" : "Dalam Asbab sahaja",
      data: s.backupRepo ? `Backup harian ke ${s.backupRepo}` : "Backup belum ditetapkan",
      keselamatan: "Kunci cap jari/PIN: akan datang",
      tentang: `Versi ${A.boot.version}`,
    }[id];
  }

  async function settings(view, cat) {
    Scene.setScene("gunung");
    const { settings: s } = await A.api("settings");
    A.boot.settings = s;
    if (!cat) {
      const list = h("div", { class: "kategori" });
      const paint = (q = "") => list.replaceChildren(...CATS
        .filter(([id, , title, kw]) => !q || `${title} ${kw}`.toLowerCase().includes(q.toLowerCase()))
        .map(([id, icon, title]) => h("a", { href: `#/tetapan/${id}`, class: "panel" },
          h("span", { class: "ikon", "aria-hidden": "true" }, icon),
          h("span", { class: "teks" }, h("strong", {}, title), h("span", {}, summary(id, s))),
          h("span", { class: "anak", "aria-hidden": "true" }, "›"))));
      paint();
      view.append(h("div", { class: "wrap stack" }, h("h1", {}, "Tetapan"),
        h("input", { class: "cari-tetapan", type: "search", placeholder: "Cari tetapan, contohnya blur atau bilal", "aria-label": "Cari tetapan", oninput: (e) => paint(e.target.value) }),
        list));
      return;
    }
    const meta = CATS.find((c) => c[0] === cat);
    if (!meta) { location.hash = "#/tetapan"; return; }
    const page = h("div", { class: "wrap stack" }, h("a", { href: "#/tetapan", class: "btn" }, "‹ Tetapan"), h("h1", {}, meta[2]));
    view.append(page);
    const status = h("p", { class: "muted", role: "status" });
    const save = async (patch) => {
      const d = await A.api("settings", { method: "PUT", body: patch });
      A.boot.settings = d.settings;
      status.textContent = "Disimpan."; buzz(15);
      setTimeout(() => (status.textContent = ""), 2500);
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
      ], (f) => ({ name: f.get("name"), zone: f.get("zone").toUpperCase(), lat: Number(f.get("lat")), lon: Number(f.get("lon")) })),

      tema: () => temaPage(s, save),

      sambungan: () => sambunganPage(),

      otak: () => h("div", { class: "stack" }, formOf([
        sw("aiEnabled", "Guna otak kedua", s.aiEnabled, "Bila dimatikan, Asbab hanya jawab dari catatan sendiri (mod tanpa AI)."),
        sw("askBeforeAI", "Minta izin sebelum guna otak kedua", s.askBeforeAI),
        h("p", { class: "muted" }, "Penyedia (Gemini, Claude, OpenAI), model, had harian setiap penyedia, peranan Chat/Coding dan susunan sandaran diatur dalam Tetapan > Sambungan & API."),
      ], (f) => ({ aiEnabled: f.get("aiEnabled") === "on", askBeforeAI: f.get("askBeforeAI") === "on" })),
        h("a", { class: "btn", href: "#/tetapan/sambungan" }, "Buka Sambungan & API")),

      suara: () => h("div", { class: "stack" }, reminderStatus(), formOf([
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

      keselamatan: () => h("div", { class: "panel stack" },
        h("p", { class: "muted" }, "Asbab tiada password lagi. Kunci dengan cap jari atau PIN telefon akan ditambah dalam fasa akan datang. Semua data disimpan dalam telefon ini sahaja.")),

      tentang: async () => {
        const { devlog } = await A.api("notes");
        return h("div", { class: "stack" }, updatePanel(), h("div", { class: "panel" }, h("h3", {}, "Log perkembangan"),
          ...devlog.map((d) => h("div", { class: "note" }, h("span", { class: "jenis" }, new Date(d.ts).toLocaleDateString("ms-MY")), h("span", { class: "tajuk" }, d.text)))));
      },
    };
    page.append(await P[cat]());
  }

  function temaPage(s, save) {
    const box = h("div", { class: "stack" });
    const paint = () => {
      const tm = Theme.get();
      const sections = tm.asing ? Theme.SECTIONS : [Theme.SECTIONS[0]];
      const slider = (key, label, min, max, unit) => h("label", { class: "slider" }, `${label}: ${tm[key]}${unit}`,
        h("input", { type: "range", min, max, value: tm[key], oninput: (e) => { Theme.set({ [key]: Number(e.target.value) }); e.target.previousSibling.textContent = `${label}: ${e.target.value}${unit}`; } }));
      box.replaceChildren(
        h("div", { class: "panel stack" },
          h("label", { class: "toggle" }, h("span", {}, "Wallpaper berbeza ikut bahagian"), h("input", { type: "checkbox", checked: tm.asing, onchange: (e) => { Theme.set({ asing: e.target.checked }); paint(); } })),
          ...sections.map(([sec, label]) => {
            const w = tm.wall[sec] || tm.wall.semua || { jenis: "alam" };
            return h("div", { class: "stack" }, h("h3", {}, label),
              h("div", { class: "wall-pilih" },
                h("button", { class: w.jenis !== "gambar" ? "dipilih" : "", style: { backgroundImage: "linear-gradient(#1b2547,#070b1a)" }, onclick: () => { Theme.setWall(sec, { jenis: "alam" }); paint(); } }, "Alam hidup"),
                w.jenis === "gambar" && w.img ? h("button", { class: "dipilih", style: { backgroundImage: `url("${w.img}")` } }, "Gambar kau") : null,
                h("label", { style: { backgroundImage: "linear-gradient(135deg,#333a55,#1a1f36)" } }, "+ Pilih gambar",
                  h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
                    const file = e.target.files[0]; if (!file) return;
                    try {
                      const img = await Theme.compress(file);
                      if (!Theme.setWall(sec, { jenis: "gambar", img })) alert("Storan peranti penuh. Cuba gambar lain atau kurangkan bilangan wallpaper berbeza.");
                      paint();
                    } catch (err) { alert(err.message); }
                  } }))));
          })),
        h("div", { class: "panel stack" }, h("h3", {}, "Kaca dan kabur"),
          slider("blur", "Blur wallpaper", 0, 30, "px"), slider("gelap", "Gelap", 0, 80, "%"), slider("kaca", "Ketebalan kaca", 0, 100, "%")),
        h("div", { class: "panel stack" }, h("h3", {}, "Warna aksen"),
          h("div", { class: "warna-aksen" }, ...Theme.AKSEN.map((c) => h("button", { class: tm.aksen === c ? "dipilih" : "", style: { background: c }, "aria-label": `Warna ${c}`, onclick: () => { Theme.set({ aksen: c }); paint(); } })))),
        h("div", { class: "panel stack" }, h("h3", {}, "Animasi dan bunyi"),
          field("Animasi", "animations", { tag: "select", value: s.animations, options: [["penuh", "Penuh"], ["ringan", "Ringan (jimat bateri)"]] }),
          h("label", { class: "toggle" }, h("span", {}, "Bunyi angin malam"), h("input", { type: "checkbox", name: "sound", checked: s.sound })),
          h("button", { class: "btn utama", onclick: async (e) => {
            const p = e.target.closest(".panel");
            const ns = await save({ animations: $("select", p).value, sound: $("input[name=sound]", p).checked });
            document.body.classList.toggle("ringan", ns.animations === "ringan");
            ns.sound ? A.Ambient.start() : A.Ambient.stop();
            Object.assign(s, ns);
          } }, "Simpan")));
    };
    paint();
    return box;
  }

  /* ---------- Sambungan & API (Phase 3) ---------- */
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
      const lamp = lampOf(keys[p.id] && c.on);
      const say = (ok, text) => { res.className = ok ? "ok-teks" : "err"; res.textContent = text; lamp.classList.toggle("ok", !!ok); lamp.classList.toggle("merah", !ok); };
      const keyIn = h("input", { type: "password", autocomplete: "off", placeholder: keys[p.id] ? "•••••••• (disimpan). Tampal baharu untuk tukar" : p.keyHint, "aria-label": `Key ${p.label}` });
      const opt = (v, cur) => h("option", { value: v, selected: v === cur }, v || "(pilih model)");
      const chatSel = h("select", { "aria-label": `Model Chat ${p.label}`, onchange: async () => { c.chatModel = chatSel.value; await persist(); } }, opt(c.chatModel, c.chatModel));
      const codeSel = h("select", { "aria-label": `Model Coding ${p.label}`, onchange: async () => { c.codingModel = codeSel.value; await persist(); } }, opt(c.codingModel, c.codingModel));
      const loadModels = async (auto) => {
        res.className = "muted"; res.textContent = "Memuat senarai model…";
        try {
          const r = await Native.aiListModels(p.id);
          if (auto || !c.chatModel) c.chatModel = r.chat || c.chatModel;
          if (auto || !c.codingModel) c.codingModel = r.coding || c.codingModel;
          const list = [...new Set([...(r.models || []), c.chatModel, c.codingModel].filter(Boolean))];
          chatSel.replaceChildren(...list.map((m) => opt(m, c.chatModel)));
          codeSel.replaceChildren(...list.map((m) => opt(m, c.codingModel)));
          await persist();
          res.className = "muted"; res.textContent = `${list.length} model tersedia. Dipilih: Chat ${c.chatModel || "-"}, Coding ${c.codingModel || "-"}.`;
          return true;
        } catch (e) { say(false, e.message); return false; }
      };
      const test = async () => {
        res.className = "muted"; res.textContent = "Menguji…";
        if (!c.chatModel && !(await loadModels(true))) return;
        const r = await Native.aiTest(p.id, c.chatModel);
        say(r.ok, (r.ok ? "Berjaya: " : "Gagal: ") + r.detail);
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
        res);
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
      actions.append(h("button", { class: "btn utama", onclick: () => Native.openUrl(u.apkUrl || u.pageUrl) }, "Muat turun update"));
    };
    return h("div", { class: "panel stack" },
      h("h3", {}, `Asbab versi ${A.boot.version}`),
      h("button", { class: "btn", onclick: check }, "Semak update"), res, actions);
  }

  window.Views = { today, orbit, project, notes, settings };
})();
