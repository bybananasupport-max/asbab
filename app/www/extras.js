// Phase 7.3 screens: full Belanja page, global search, and closing any sheet by tapping outside or swiping down.
(function () {
  const nn = (kids) => kids.filter((k) => k != null && k !== false);
  const rm = (n) => `RM${Number(n || 0).toFixed(2)}`;
  const buzz = (ms = 8) => navigator.vibrate?.(ms);
  const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  /* ---------- every popup closes by tapping outside or swiping down ---------- */
  // Works for A.sheet, the forms in views.js and anything else with class "sheet".
  function dismissable(sheet, close) {
    if (sheet.dataset.tutupLuar) return;
    sheet.dataset.tutupLuar = "1";
    const latar = document.createElement("div");
    latar.className = "sheet-latar";
    latar.onclick = () => close();
    sheet.before(latar);
    requestAnimationFrame(() => latar.classList.add("buka"));
    const gone = new MutationObserver(() => { if (!sheet.isConnected) { latar.remove(); gone.disconnect(); } });
    gone.observe(document.body, { childList: true });
    let y0 = null, dy = 0;
    sheet.addEventListener("touchstart", (e) => { y0 = sheet.scrollTop <= 0 && !e.target.closest("input, textarea, select, canvas, .minda") ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
    sheet.addEventListener("touchmove", (e) => {
      if (y0 == null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      sheet.style.transition = "none";
      sheet.style.transform = `translate(-50%, ${dy}px)`;
    }, { passive: true });
    sheet.addEventListener("touchend", () => {
      if (y0 == null) return;
      sheet.style.transition = "transform .2s ease";
      if (dy > 90) { sheet.style.transform = "translate(-50%, 110%)"; setTimeout(close, 180); }
      else sheet.style.transform = "";
      y0 = null;
    });
  }
  // Catches sheets added anywhere (forms in views.js, quick sheet, older code) and makes them dismissable.
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.classList.contains("sheet") && !n.dataset.tutupLuar) {
        dismissable(n, () => (typeof n.close === "function" ? n.close() : n.remove()));
      }
    }
  }).observe(document.body, { childList: true });

  /* ---------- full Belanja page (from the "Belanja hari ini" card) ---------- */
  async function belanjaPage(view) {
    let mode = localStorage.getItem("asbab:belanjaMod") || "7";
    let month = new Date().toISOString().slice(0, 7);
    const body = h("div", {});
    const filt = h("div", { class: "seksyen-pilih" });
    const wrap = h("div", { class: "wrap" }, h("a", { class: "kembali", href: "#/hari-ini" }, "‹ Hari Ini"), h("h1", {}, "Belanja"), filt, body);
    view.append(wrap);
    const { notes } = await A.api("notes");
    const spend = notes.filter((n) => n.kind === "belanja");
    const months = [...new Set(spend.map((n) => n.date.slice(0, 7)))].sort().reverse();
    if (!months.includes(month)) months.unshift(month);
    const paint = () => {
      filt.replaceChildren(...nn([...[["7", "7 hari"], ["30", "30 hari"], ["bulan", "Ikut bulan"]].map(([id, l]) => h("button", { class: mode === id ? "dipilih" : "", onclick: () => { mode = id; localStorage.setItem("asbab:belanjaMod", id); paint(); buzz(); } }, l)),
        mode === "bulan" ? h("select", { class: "pilih-bulan", onchange: (e) => { month = e.target.value; paint(); } }, ...months.map((m) => h("option", { value: m, selected: m === month }, new Date(m + "-15").toLocaleDateString("ms-MY", { month: "long", year: "numeric" })))) : null]));
      // Days in the chosen period.
      const days = [];
      if (mode === "bulan") {
        const [y, mo] = month.split("-").map(Number);
        const last = new Date(y, mo, 0).getDate();
        for (let d = 1; d <= last; d++) days.push(`${month}-${String(d).padStart(2, "0")}`);
      } else {
        const n = Number(mode);
        for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(isoLocal(d)); }
      }
      const list = spend.filter((n) => n.date >= days[0] && n.date <= days[days.length - 1]).sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
      const perDay = days.map((d) => list.filter((n) => n.date === d).reduce((t, n) => t + (n.amount || 0), 0));
      const total = perDay.reduce((a, b) => a + b, 0);
      const today = isoLocal(new Date());
      const counted = days.filter((d) => d <= today).length || 1;
      const cats = {};
      for (const n of list) { const c = Tools.categoryOf(n.title); cats[c] = (cats[c] || 0) + (n.amount || 0); }
      const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      const max = Math.max(1, ...perDay);
      const W = 320, H = 120, bw = (W - 8) / days.length;
      const bars = perDay.map((v, i) => `<rect x="${4 + bw * i + bw * 0.12}" y="${H - 18 - (v / max) * (H - 28)}" width="${Math.max(1, bw * 0.76)}" height="${(v / max) * (H - 28)}" rx="2" class="${days[i] === today ? "hari-ini" : ""}"/>`).join("");
      const step = Math.ceil(days.length / 7);
      const labels = days.map((d, i) => (i % step ? "" : `<text x="${4 + bw * (i + 0.5)}" y="${H - 4}" text-anchor="middle">${Number(d.slice(8))}</text>`)).join("");
      const had = A.boot.settings.belanjaHad || {};
      body.replaceChildren(...nn([
        h("div", { class: "kad graf-belanja" }, h("div", { html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Belanja setiap hari">${bars}${labels}</svg>` })),
        h("div", { class: "grid2" },
          h("div", { class: "kad kad-stat" }, h("span", { class: "label" }, "Jumlah"), h("span", { class: "nilai" }, rm(total))),
          h("div", { class: "kad kad-stat" }, h("span", { class: "label" }, "Purata sehari"), h("span", { class: "nilai" }, rm(total / counted)))),
        mode === "bulan" && had.bulanan ? h("div", { class: "kecil", style: { marginTop: "6px" } }, `Had bulanan ${rm(had.bulanan)}: ${Math.round((total / had.bulanan) * 100)}% digunakan`) : null,
        catRows.length ? h("div", { class: "kumpulan" }, h("h4", {}, "Pecahan kategori"), h("div", { class: "senarai" }, ...catRows.map(([c, v]) => h("div", { class: "baris" },
          h("span", { class: "teks" }, h("strong", {}, c), h("span", { class: "bar-kategori", style: { "--lebar": `${Math.round((v / (total || 1)) * 100)}%` } })),
          h("span", { class: "kanan" }, `${rm(v)} · ${Math.round((v / (total || 1)) * 100)}%`))))) : null,
        h("div", { class: "kumpulan" }, h("h4", {}, `Item (${list.length})`),
          list.length ? h("div", { class: "senarai" }, ...list.slice(0, 120).map((n) => h("button", { class: "baris", onclick: () => item(n) },
            h("span", { class: "teks" }, h("strong", {}, n.title), h("span", { class: "kecil-baris" }, `${n.date} · ${Tools.categoryOf(n.title)}`)),
            h("span", { class: "kanan" }, rm(n.amount))))) : h("p", { class: "kecil" }, "Tiada belanja dalam tempoh ini.")),
        h("button", { class: "cip", style: { marginTop: "10px" }, onclick: () => Views.addBelanja() }, "+ Rekod belanja"),
      ]));
    };
    const item = (n) => {
      const s = A.sheet(n.title, { sub: `${rm(n.amount)} · ${n.date} · ${Tools.categoryOf(n.title)}` },
        n.text && n.text !== n.title ? h("p", { class: "kecil" }, n.text) : null,
        h("div", { class: "row" },
          h("button", { class: "btn", onclick: () => { s.close(); Views.editNote(n); } }, "Edit"),
          h("button", { class: "btn bahaya", onclick: () => { s.close(); Views.deleteNote(n, null); } }, "Padam")));
    };
    paint();
  }

  /* ---------- global search ---------- */
  let searchOpen = false;
  async function openSearch() {
    if (searchOpen) return;
    searchOpen = true;
    buzz(10);
    const input = h("input", { type: "search", placeholder: "Cari chat, catatan, belanja, jadual, assignment, project, tetapan", "aria-label": "Carian sejagat", enterkeyhint: "search" });
    const out = h("div", { class: "hasil-cari" }, h("p", { class: "kecil" }, "Semua carian dibuat dalam telefon."));
    const close = () => { searchOpen = false; pane.classList.remove("buka"); setTimeout(() => pane.remove(), 250); };
    const pane = h("div", { class: "cari-sejagat", role: "dialog", "aria-label": "Carian sejagat" },
      h("div", { class: "cari-atas" }, input, h("button", { class: "ikon-btn", "aria-label": "Tutup carian", html: ICON.tutup, onclick: close })), out);
    document.body.append(pane);
    requestAnimationFrame(() => { pane.classList.add("buka"); input.focus(); });
    const { data } = await A.api("cari");
    data.settings = (Views.CATS || []).map((c) => [c[0], c[2], c[3]]);
    let t = null;
    input.oninput = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const groups = Tools.searchAll(input.value, data);
        out.replaceChildren(...(groups.length ? groups.map((g) => h("div", { class: "kumpulan" }, h("h4", {}, `${g.nama}${g.lebih ? ` (+${g.lebih} lagi)` : ""}`),
          h("div", { class: "senarai" }, ...g.items.map((it) => h("a", { class: "baris", href: it.hash, onclick: () => close() },
            h("span", { class: "teks" }, h("strong", {}, it.tajuk), h("span", { class: "kecil-baris" }, it.sub))))))) :
          [h("p", { class: "kecil" }, input.value.trim().length < 2 ? "Taip sekurang-kurangnya 2 huruf." : "Tiada hasil.")]));
      }, 120);
    };
    pane.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }
  // Pull down at the top of any page opens the search.
  (function pullToSearch() {
    let y0 = null, x0 = 0, hint = null;
    const view = () => document.getElementById("view");
    addEventListener("touchstart", (e) => {
      const v = view();
      if (!v || searchOpen || document.querySelector(".sheet, .laci, .gel.buka") || v.scrollTop > 0 || e.target.closest(".minda, .medan, .composer, input, textarea")) { y0 = null; return; }
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
    }, { passive: true });
    addEventListener("touchmove", (e) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
      if (dx > dy) { y0 = null; hint?.remove(); hint = null; return; }
      if (dy > 20 && !hint) { hint = h("div", { class: "tarik-cari" }, "🔍 Lepaskan untuk cari"); document.body.append(hint); }
      if (hint) { hint.style.opacity = Math.min(1, dy / 110); hint.classList.toggle("sedia", dy > 110); }
    }, { passive: true });
    addEventListener("touchend", () => {
      if (hint) { const go = hint.classList.contains("sedia"); hint.remove(); hint = null; if (go) openSearch(); }
      y0 = null;
    });
  })();

  window.Extras = { dismissable, belanjaPage, openSearch };
})();
