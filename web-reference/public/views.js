// Asbab: halaman Hari Ini, Project, Catatan dan Tetapan.
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
        : h("div", { class: "panel" }, "Waktu solat tak dapat diambil daripada JAKIM. Semak zon dalam Tetapan > Profil."),
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
    const used = A.boot.usage.count, cap = A.boot.settings.aiDailyCap;
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
        ["Ruang kerja", () => dive(n.el, p)],
        ...(p.pending ? [["Cadangan menunggu", () => dive(n.el, p), "#e8706a"]] : []),
        ["Butiran", () => editProject(p)],
        [p.archived ? "Keluar arkib" : "Arkib", async () => { await A.api(`projects/${p.id}`, { method: "PATCH", body: { archived: !p.archived } }); route(); }],
        ...(p.url ? [["Buka website", () => open(p.url, "_blank", "noopener")]] : []),
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
      field("Alamat website untuk dipantau 24 jam (pilihan)", "url", { type: "url", placeholder: "https://contoh.com" }),
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
    if (!A.boot.ai) { work.prepend(h("div", { class: "panel err" }, "ANTHROPIC_API_KEY belum diset, jadi Asbab belum boleh mengubah kod.")); return; }
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
        weight: "light", maxTokens: 400,
        system: "Kau memilih fail kod yang perlu dibaca untuk satu tugasan. Balas HANYA dengan JSON array laluan fail, maksimum 10.",
        prompt: `Tugasan: ${task}\n\nSenarai fail:\n${files.slice(0, 800).map((f) => f.path).join("\n")}`,
      });
      let paths = [];
      try { paths = JSON.parse(pick.match(/\[[\s\S]*\]/)[0]); } catch { paths = files.slice(0, 5).map((f) => f.path); }
      status.textContent = `Membaca ${paths.length} fail…`;
      const read = await A.api(`projects/${p.id}/read`, { method: "POST", body: { paths } });
      status.textContent = "Menulis cadangan perubahan…";
      const raw = await A.think({
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
      const parsed = parseProposal(raw);
      if (!parsed.files.length) throw new Error("Cadangan tak mengandungi fail dalam format yang betul. Cuba minta sekali lagi dengan lebih spesifik.");
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
          h("a", { class: "btn", href: pr.commit.url, target: "_blank", rel: "noopener" }, "Lihat commit"),
          p.url ? h("a", { class: "btn", href: p.url, target: "_blank", rel: "noopener" }, "Buka website") : null,
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
    ["sambungan", "🔌", "Sambungan & API", "api key claude github notifikasi sandbox uji"],
    ["otak", "🧠", "Otak Kedua", "ai claude had izin penggunaan"],
    ["suara", "🔔", "Bila Asbab Bersuara", "bilal solat taklimat pagi check-in petang waktu senyap keutamaan"],
    ["personaliti", "💬", "Personaliti", "personaliti cara bercakap nilai"],
    ["akses", "📱", "Akses Telefon", "toggle suis whatsapp email sms bank skrin fail senarai blok simpan"],
    ["butang", "🌙", "Butang Terapung", "butang bulan jalur kedudukan"],
    ["data", "💾", "Data & Backup", "backup eksport pulih identiti"],
    ["keselamatan", "🔒", "Keselamatan", "password kunci"],
    ["tentang", "ℹ️", "Tentang Asbab", "versi log perkembangan"],
  ];

  function summary(id, s) {
    const tm = Theme.get();
    return {
      profil: `${s.name} · zon ${s.zone}`,
      tema: `${tm.asing ? "Wallpaper ikut bahagian" : (tm.wall.semua?.jenis === "gambar" ? "Gambar sendiri" : "Alam hidup")} · blur ${tm.blur}`,
      sambungan: `Claude ${A.boot.ai ? "bersambung" : "belum"} · GitHub ${A.boot.github ? "bersambung" : "belum"}`,
      otak: s.aiEnabled ? `Hidup · ${A.boot.usage.count}/${s.aiDailyCap} hari ini` : "Dimatikan (mod tanpa AI)",
      suara: `Mod Bilal ${s.bilalLead} minit · taklimat ${s.briefTime}`,
      personaliti: s.personality.slice(0, 60) + "…",
      akses: `${Object.values(s.access).filter(Boolean).length} daripada ${Object.keys(s.access).length} suis hidup`,
      butang: localStorage.getItem("asbab:moonOff") === "1" ? "Disembunyikan" : "Dipaparkan",
      data: "Backup identiti dan pulihkan",
      keselamatan: "Kunci Asbab di peranti ini",
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

      sambungan: () => h("div", { class: "stack" },
        ...[["claude", "Claude (otak kedua)", A.boot.ai, "ANTHROPIC_API_KEY"], ["github", "GitHub (project kod, bina APK, sandbox)", A.boot.github, "GITHUB_TOKEN"], ["notifikasi", "Notifikasi telefon", !!A.boot.pushKey, "VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY"]].map(([svc, title, ok, env]) => {
          const res = h("p", { class: "muted", role: "status" });
          return h("div", { class: "panel stack" },
            h("h3", {}, h("span", { class: `lampu${ok ? " ok" : ""}` }), title),
            h("input", { type: "password", placeholder: "Dalam app Android, tampal key di sini", disabled: true, "aria-label": `Key ${title}` }),
            h("p", { class: "muted" }, `Dalam versi web ni, key diletak dalam Netlify sebagai ${env}. Dalam app Android nanti, kau tampal di sini dan ia disimpan dalam telefon.`),
            svc !== "notifikasi" ? h("button", { class: "btn", onclick: async () => {
              res.textContent = "Menguji…";
              try { const r = await A.api(`test/${svc}`); res.textContent = r.ok ? `Berjaya: ${r.detail}` : `Gagal: ${r.detail}`; }
              catch (e) { res.textContent = `Gagal: ${e.message}`; }
            } }, "Uji sambungan") : (A.boot.pushKey ? h("button", { class: "btn", onclick: () => enablePush(res) }, "Hidupkan notifikasi untuk telefon ni") : null),
            res);
        })),

      otak: () => formOf([
        sw("aiEnabled", "Guna otak kedua", s.aiEnabled, "Bila dimatikan, Asbab hanya jawab dari catatan sendiri."),
        sw("askBeforeAI", "Minta izin sebelum guna Claude", s.askBeforeAI),
        field("Had penggunaan sehari", "aiDailyCap", { type: "number", value: s.aiDailyCap }),
        h("p", { class: "muted" }, `Digunakan hari ini: ${A.boot.usage.count} kali.`),
      ], (f) => ({ aiEnabled: f.get("aiEnabled") === "on", askBeforeAI: f.get("askBeforeAI") === "on", aiDailyCap: Number(f.get("aiDailyCap")) })),

      suara: () => formOf([
        field("Mod Bilal: ingatkan berapa minit sebelum waktu", "bilalLead", { type: "number", value: s.bilalLead }),
        h("div", { class: "row" }, field("Taklimat pagi", "briefTime", { type: "time", value: s.briefTime }), field("Check-in petang", "checkinTime", { type: "time", value: s.checkinTime })),
        h("div", { class: "row" }, field("Waktu senyap dari", "quietFrom", { type: "time", value: s.quietFrom }), field("hingga", "quietTo", { type: "time", value: s.quietTo })),
        field("Maksimum check-in sehari", "maxProactive", { type: "number", value: s.maxProactive }),
        field("Keutamaan (satu baris satu, paling penting di atas)", "priorities", { tag: "textarea", rows: 5, value: s.priorities.join("\n") }),
      ], (f) => ({
        bilalLead: Number(f.get("bilalLead")), briefTime: f.get("briefTime"), checkinTime: f.get("checkinTime"),
        quietFrom: f.get("quietFrom"), quietTo: f.get("quietTo"), maxProactive: Number(f.get("maxProactive")),
        priorities: f.get("priorities").split("\n").map((x) => x.trim()).filter(Boolean),
      })),

      personaliti: () => formOf([
        h("p", { class: "muted" }, "Cara Asbab bercakap dan nilai yang dia pegang. Kekal sama walaupun model AI ditukar."),
        field("Fail personaliti", "personality", { tag: "textarea", rows: 12, value: s.personality }),
      ], (f) => ({ personality: f.get("personality") })),

      akses: () => {
        const T = [["whatsapp", "Baca WhatsApp"], ["email", "Baca email"], ["sms_bank", "Baca SMS dan notifikasi bank/TNG"], ["skrin", "Baca isi skrin app"], ["fail", "Baca fail dalam telefon"], ["penggunaan_app", "Catat penggunaan app"]];
        return formOf([
          h("p", { class: "muted" }, "Suis ni berfungsi dalam app Android Asbab. App bank, e-wallet, password dan OTP sentiasa ditutup."),
          ...T.map(([k, label]) => sw(`acc_${k}`, label, s.access[k])),
          field("Orang atau kumpulan yang Asbab tak boleh baca (satu baris satu)", "blocklist", { tag: "textarea", rows: 4, value: (s.blocklist || []).join("\n") }),
          field("Padam mesej asal selepas berapa hari", "retentionDays", { type: "number", value: s.retentionDays || 3 }),
        ], (f) => ({
          access: Object.fromEntries(T.map(([k]) => [k, f.get(`acc_${k}`) === "on"])),
          blocklist: f.get("blocklist").split("\n").map((x) => x.trim()).filter(Boolean),
          retentionDays: Number(f.get("retentionDays")) || 3,
        }));
      },

      butang: () => {
        const off = localStorage.getItem("asbab:moonOff") === "1";
        return h("div", { class: "panel stack" },
          h("label", { class: "toggle" }, h("span", {}, "Paparkan butang bulan"), h("input", { type: "checkbox", checked: !off, onchange: (e) => {
            localStorage.setItem("asbab:moonOff", e.target.checked ? "0" : "1");
            const m = $("#moonbtn"); if (m) m.style.display = e.target.checked ? "" : "none";
          } })),
          h("p", { class: "muted" }, "Tekan butang bulan untuk buka jalur menu. Seret ke bawah skrin untuk tidurkan."),
          h("button", { class: "btn", onclick: () => { localStorage.removeItem("asbab:moon"); location.reload(); } }, "Kembalikan ke kedudukan asal"));
      },

      data: () => h("div", { class: "panel stack" },
        h("p", { class: "muted" }, "Semua nota, chat, tetapan dan personaliti Asbab dalam satu fail. Pindah server atau tukar AI, Asbab tetap Asbab."),
        h("div", { class: "row" },
          h("button", { class: "btn", onclick: async () => {
            const d = await A.api("export");
            h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" })), download: `asbab-identiti-${todayISO()}.json` }).click();
          } }, "Muat turun backup"),
          h("label", { class: "btn" }, "Pulihkan dari fail", h("input", { type: "file", accept: "application/json", hidden: true, onchange: async (e) => {
            const file = e.target.files[0]; if (!file) return;
            if (!confirm("Pulihkan akan menulis semula data sedia ada. Teruskan?")) return;
            try { const r = await A.api("import", { method: "POST", body: JSON.parse(await file.text()) }); alert(`Dipulihkan: ${r.count} rekod.`); location.reload(); }
            catch (err) { alert(err.message); }
          } })))),

      keselamatan: () => h("div", { class: "panel stack" },
        h("p", { class: "muted" }, "Password ditukar melalui ASBAB_PASSWORD dalam Netlify. Dalam app Android nanti, Asbab dikunci dengan cap jari atau PIN."),
        h("button", { class: "btn bahaya", onclick: () => { localStorage.removeItem("asbab:key"); location.reload(); } }, "Kunci Asbab sekarang")),

      tentang: async () => {
        const { devlog } = await A.api("notes");
        return h("div", { class: "panel" }, h("p", {}, `Asbab versi ${A.boot.version}`),
          ...devlog.map((d) => h("div", { class: "note" }, h("span", { class: "jenis" }, new Date(d.ts).toLocaleDateString("ms-MY")), h("span", { class: "tajuk" }, d.text))));
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

  async function enablePush(st) {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { st.textContent = "Kebenaran notifikasi tak diberi."; return; }
      const reg = await navigator.serviceWorker.ready;
      const key = A.boot.pushKey.replace(/-/g, "+").replace(/_/g, "/");
      const raw = Uint8Array.from(atob(key + "=".repeat((4 - (key.length % 4)) % 4)), (c) => c.charCodeAt(0));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
      await A.api("push/subscribe", { method: "POST", body: sub.toJSON() });
      st.textContent = "Notifikasi dihidupkan untuk telefon ni.";
    } catch (e) { st.textContent = `Tak berjaya: ${e.message}`; }
  }

  window.Views = { today, orbit, project, notes, settings };
})();
