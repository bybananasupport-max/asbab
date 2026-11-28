// Asbab upgrading itself, Phase 7.2 (look: asbab-ui-pratonton.html, Project > Asbab sendiri).
// Request cards with a 5-stage bar · in-app agent · monitor with notifications · test APK and updates are
// installed only after a backup to the backup repo · "Apa yang baharu" · screenshot with circles · crash reports.
(function () {
  const U = window.Upgrade;
  const nn = (kids) => kids.filter((k) => k != null && k !== false);
  const buzz = (ms = 10) => navigator.vibrate?.(ms);
  const RISK = { rendah: ["hijau", "Risiko rendah"], sederhana: ["kuning", "Sederhana"], tinggi: ["merah", "Risiko tinggi"] };
  const AGENT = { asbab: "AI dalam Asbab", gemini: "Gemini (GitHub)" };
  const at = (ts) => (ts ? new Date(ts).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", hour12: false }) : "");

  /* ---------- errors kept for "Baiki bug" ---------- */
  function keepError(msg) {
    try {
      const list = JSON.parse(localStorage.getItem("asbab:ralat") || "[]");
      list.push(`${new Date().toISOString()} ${String(msg).slice(0, 400)}`);
      localStorage.setItem("asbab:ralat", JSON.stringify(list.slice(-20)));
    } catch { /* storage full: ignore */ }
  }
  async function errorLog() {
    const web = JSON.parse(localStorage.getItem("asbab:ralat") || "[]").join("\n");
    const { log } = await Native.crashLog();
    return [log ? `--- Crash Android ---\n${log}` : "", web ? `--- Ralat skrin ---\n${web}` : ""].filter(Boolean).join("\n\n");
  }

  /* ---------- backup first, then the install screen (Amin's rule) ---------- */
  async function installWithBackup(url, label) {
    if (!url) return A.toast("Fail APK tak dijumpai.");
    if (!A.boot.settings.backupRepo) {
      const s = A.sheet("Backup dulu", { sub: "Sebelum setiap kemas kini" },
        h("p", { class: "kecil" }, "Asbab buat backup ke repo backup kau sebelum memasang apa-apa versi. Repo backup belum ditetapkan."),
        h("button", { class: "btn utama", onclick: () => { s.close(); location.hash = "#/tetapan/data"; } }, "Tetapkan backup"));
      return;
    }
    const status = h("p", { class: "kecil" }, "Backup sedang dibuat ke repo backup…");
    const actions = h("div", { class: "row" });
    const s = A.sheet(label || "Pasang versi", { sub: "Backup dulu, kemudian skrin pasang" }, status, actions);
    const r = await Native.backupNow();
    if (!r.ok) {
      status.textContent = `Backup gagal: ${r.message}. Pemasangan dibatalkan supaya data kau selamat.`;
      actions.append(h("button", { class: "btn", onclick: () => s.close() }, "Tutup"));
      return;
    }
    buzz(20);
    status.replaceChildren(h("strong", {}, "✓ Backup selesai"), h("span", { class: "kecil", style: { display: "block" } }, "Data kau dah selamat dalam repo backup. Sekarang Asbab muat turun APK dan buka skrin pasang Android."));
    actions.append(h("button", { class: "btn utama", onclick: async (e) => {
      e.target.disabled = true; e.target.textContent = "Memuat turun…";
      try {
        const res = await Native.downloadInstall(url);
        if (res && res.perluIzin) A.toast("Benarkan \"Pasang app tidak diketahui\" untuk Asbab, kemudian tekan sekali lagi.", { ms: 6000 });
        s.close();
      } catch (err) { status.append(h("p", { class: "err" }, err.message)); e.target.disabled = false; e.target.textContent = "Cuba lagi"; }
    } }, "Buka skrin pasang"));
  }

  /* ---------- "Apa yang baharu" ---------- */
  function showWhatsNew(w) {
    A.sheet(`Apa yang baharu dalam ${w.version}`, { sub: "Upgrade yang kau luluskan" },
      ...w.items.map((x) => h("div", { class: "kad item" }, h("strong", {}, x.title), h("span", { class: "kecil" }, x.text))));
  }

  /* ---------- request card (preview: Permintaan) ---------- */
  function stageBar(r) {
    const i = U.stageIndex(r.stage);
    return h("div", {},
      h("div", { class: "tahap", "aria-label": `Tahap: ${U.STAGE_NAMES[r.stage] || r.stage}` }, ...U.STAGES.map((_, j) => h("i", { class: r.stage === "dipasang" || j < i ? "siap" : j === i ? (r.stage === "gagal" ? "gagal" : "kini") : "" }))),
      h("div", { class: "tahap-label" }, ...["Spesifikasi", "Bekerja", "Dibina", "Ujian", "Dipasang"].map((t) => h("span", {}, t))));
  }
  function holdButton(label, enabled, why, onDone) {
    const b = h("button", { class: `tahan${enabled ? "" : " mati"}`, "aria-label": label }, h("span", { class: "isi" }), h("span", { class: "lbl" }, enabled ? label : why));
    let t = null;
    const start = (e) => {
      if (!enabled) { A.toast(why); return; }
      e.preventDefault();
      b.classList.add("tekan"); buzz(10);
      t = setTimeout(() => { t = null; b.classList.remove("tekan"); buzz(40); onDone(); }, 1300);
    };
    const stop = () => { if (t) clearTimeout(t); t = null; b.classList.remove("tekan"); };
    b.addEventListener("pointerdown", start);
    b.addEventListener("pointerup", stop); b.addEventListener("pointerleave", stop); b.addEventListener("pointercancel", stop);
    return b;
  }
  function requestCard(p, r, refresh) {
    const [cls, riskLabel] = RISK[r.risk] || RISK.sederhana;
    const api = (d, opt = { method: "POST" }) => A.api(`minta/${p.id}/${r.id}${d ? "/" + d : ""}`, opt);
    const act = (fn) => async (e) => { e?.target && (e.target.disabled = true); try { await fn(); } catch (err) { A.toast(err.message, { ms: 6000 }); } refresh(); };
    const time = r.startedAt ? `${U.minutes(r.startedAt, r.builtAt || r.mergedAt || Date.now())} minit` : "";
    const info = [
      r.stage === "spesifikasi" ? "Menunggu kau tekan Teruskan" : `Tukang: ${AGENT[r.agent] || r.agent}`,
      r.stage === "giliran" ? "dalam giliran" : r.startedAt ? `dimulakan ${at(r.startedAt)}` : "",
      r.waitingAgent ? "issue dibuka; tukang Gemini belum ditetapkan" : "",
    ].filter(Boolean).join(" · ");
    const card = h("div", { class: "kad minta" },
      h("div", { class: "baris-asbab" }, h("strong", { style: { flex: 1 } }, r.title), h("span", { class: `lencana ${cls}` }, riskLabel)),
      h("div", { class: "kecil" }, info),
      stageBar(r));
    const row = h("div", { class: "baris-aksi" });
    const add = (...x) => row.append(...nn(x));
    if (r.stage === "spesifikasi") {
      card.append(h("details", {}, h("summary", { class: "kecil" }, "Spesifikasi"), h("div", { class: "isi-msg", html: Markdown.toHtml(r.spec || r.summary || "") }),
        r.checklist?.length ? h("ul", { class: "kecil" }, ...r.checklist.map((c) => h("li", {}, c.text))) : null));
      add(h("button", { class: "cip kuat", onclick: act(async () => { const x = await api("teruskan"); if (x.request.stage === "bekerja" && x.request.agent === "asbab") runAgent(p, x.request); }) }, "Teruskan"),
        h("button", { class: "cip", onclick: act(() => api("batal")) }, "Batal"));
    }
    if (r.stage === "bekerja" && r.agent === "asbab" && !working.has(r.id)) add(h("button", { class: "cip", onclick: () => runAgent(p, r) }, "Sambung kerja"));
    if (working.has(r.id)) card.append(h("div", { class: "kecil kerja-langsung" }, working.get(r.id)));
    if (r.issue) add(h("button", { class: "cip", onclick: () => Native.openUrl(r.issue.url) }, "Issue"));
    if (r.pr) add(h("button", { class: "cip", onclick: () => Native.openUrl(r.pr.url) }, `PR #${r.pr.number}`));
    if (r.stage === "gagal") {
      card.append(h("p", { class: "err" }, "Binaan gagal."));
      add(r.build ? h("button", { class: "cip", onclick: () => Native.openUrl(r.build.url) }, "Log") : null,
        h("button", { class: "cip kuat", onclick: () => askFix(p, r, refresh, "Binaan gagal. Baiki ralat binaan.") }, "Minta pembetulan"));
    }
    if (r.stage === "ujian") {
      add(h("button", { class: "cip kuat", onclick: act(async () => { await api("", { method: "PATCH", body: { tested: true } }); await installWithBackup(r.apk?.url, `Cuba versi ujian ${r.apk?.version || ""}`); }) }, "Cuba versi ujian"),
        h("button", { class: "cip", onclick: () => askFix(p, r, refresh) }, "Minta pembetulan"));
      if (r.risk === "tinggi" && r.checklist?.length) {
        card.append(h("div", { class: "semak-list" }, ...r.checklist.map((c, i) => h("label", {}, h("input", { type: "checkbox", checked: !!c.done, onchange: act(async () => {
          const list = r.checklist.map((x, j) => ({ done: j === i ? !x.done : x.done }));
          await api("", { method: "PATCH", body: { checklist: list } });
        }) }), c.text))));
      }
    }
    card.append(row);
    if (r.stage === "ujian") {
      const ok = U.canApprove(r);
      card.append(holdButton("Tekan dan tahan untuk lulus", ok.ok, ok.why, act(async () => {
        const x = await api("lulus");
        A.toast("Diluluskan. Binaan rasmi sedang dibuat; kemas kini akan ditawarkan bila siap.", { ms: 6000 });
        if (x.next) startNext(p);
      })));
    }
    if (["dipasang", "ditolak"].includes(r.stage)) card.append(h("div", { class: "kecil" }, r.stage === "dipasang" ? `Diluluskan ${at(r.mergedAt)}. Kemas kini muncul dalam Tentang Asbab selepas binaan rasmi.` : "Dibatalkan."));
    card.append(h("div", { class: "kecil kos" }, `~${(r.tokens || 0).toLocaleString("ms-MY")} token${time ? ` · ${time}` : ""}`));
    return card;
  }
  function askFix(p, r, refresh, preset = "") {
    const ta = h("textarea", { rows: 4, placeholder: "Apa yang tak kena? Contoh: butang terlalu kecil" }, preset);
    const s = A.sheet("Minta pembetulan", { sub: r.title }, ta, h("button", { class: "btn utama", style: { marginTop: "10px", width: "100%" }, onclick: async () => {
      if (!ta.value.trim()) return;
      s.close();
      try {
        const x = await A.api(`minta/${p.id}/${r.id}/pembetulan`, { method: "POST", body: { text: ta.value.trim() } });
        if (x.request.agent === "asbab") runAgent(p, x.request);
      } catch (e) { A.toast(e.message, { ms: 6000 }); }
      refresh();
    } }, "Hantar"));
  }

  /* ---------- the in-app agent (AI dalam Asbab) ---------- */
  const working = new Map();
  async function runAgent(p, r) {
    if (working.has(r.id)) return;
    if (!A.boot.ai) return A.toast("Tukang AI dalam Asbab perlukan otak kedua yang aktif.", { ms: 5000 });
    working.set(r.id, "Asbab sedang meneliti repo…");
    const show = (t) => { working.set(r.id, t); document.querySelectorAll(".kerja-langsung").forEach((el) => { if (el.closest(".minta")) el.textContent = t; }); };
    Native.notify(`minta:${r.id}`, "Asbab sedang bekerja", r.title, `#/project/${p.id}`);
    try {
      const task = `${r.text}\n\nSpesifikasi:\n${r.spec}\n${(r.fixes || []).length ? `\nPembetulan yang diminta:\n${r.fixes.map((f) => `- ${f.text}`).join("\n")}` : ""}\nJangan ubah fail: ${U.FORBIDDEN.map((x) => x.source.replace(/[\\^$]/g, "")).join(", ")}.`;
      const out = await Views.generateChange(p, task, { onStatus: show, onStream: () => {}, branch: r.fixes?.length ? r.branch : undefined });
      show("Menghantar ke branch sendiri dan membuka pull request…");
      await A.api(`minta/${p.id}/${r.id}/hasil`, { method: "POST", body: { files: out.files, summary: out.summary, tokens: out.tokens } });
      Native.notify(`minta:${r.id}`, "Sedang dibina", `${r.title}: pull request dibuka, APK ujian sedang dibina.`, `#/project/${p.id}`);
    } catch (e) {
      A.toast(e.message, { ms: 7000 });
      Native.notify(`minta:${r.id}`, "Tukang berhenti", `${r.title}: ${e.message}`, `#/project/${p.id}`);
    } finally {
      working.delete(r.id);
      refreshBlocks();
    }
  }
  async function startNext(p) {
    try {
      const { request } = await A.api(`minta/${p.id}/x/mula`, { method: "POST" }).catch(() => ({ request: null }));
      if (request && request.agent === "asbab") runAgent(p, request);
    } catch { /* nothing waiting */ }
  }
  const refreshBlocks = () => { if (document.body.classList.contains("seg-kerja")) A.projectSeg?.("kerja", true); };

  /* ---------- monitor: follows active requests while Asbab is open ---------- */
  let timer = null;
  const NOTE = { dibina: "APK ujian sedang dibina", ujian: "APK ujian sedia dicuba", gagal: "Binaan gagal", bekerja: "Tukang sedang bekerja" };
  async function checkAll() {
    if (!A.boot?.github) return;
    for (const p of A.boot.projects || []) {
      if (p.type !== "kod") continue;
      let reqs;
      try { reqs = (await A.api(`minta/${p.id}`)).requests; } catch { continue; }
      for (const r of reqs.filter((x) => ["bekerja", "dibina", "gagal"].includes(x.stage))) {
        if (r.stage === "bekerja" && r.agent === "asbab") continue; // the in-app agent reports itself
        try {
          const before = r.stage;
          const x = (await A.api(`minta/${p.id}/${r.id}/semak`, { method: "POST" })).request;
          if (x.stage !== before) {
            Native.notify(`minta:${r.id}`, NOTE[x.stage] || "Permintaan dikemas kini", `${x.title}${x.stage === "ujian" ? ": tekan untuk cuba" : ""}`, `#/project/${p.id}`);
            refreshBlocks();
          }
        } catch { /* offline or no permission: try later */ }
      }
    }
  }
  function startMonitor() {
    clearInterval(timer);
    timer = setInterval(() => { if (document.visibilityState === "visible") checkAll(); }, 90_000);
    setTimeout(checkAll, 5000);
    Native.onResume?.(() => checkAll());
  }

  /* ---------- new request: text, optional screenshot with circles ---------- */
  function annotate(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = h("canvas", { class: "kanvas-bulat" });
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0, c.width, c.height);
        g.strokeStyle = "#ff4d4d"; g.lineWidth = Math.max(4, c.width / 160); g.lineCap = "round"; g.lineJoin = "round";
        let drawing = false;
        const pos = (e) => { const b = c.getBoundingClientRect(); return [(e.clientX - b.left) * (c.width / b.width), (e.clientY - b.top) * (c.height / b.height)]; };
        c.addEventListener("pointerdown", (e) => { drawing = true; c.setPointerCapture(e.pointerId); g.beginPath(); g.moveTo(...pos(e)); });
        c.addEventListener("pointermove", (e) => { if (!drawing) return; g.lineTo(...pos(e)); g.stroke(); });
        c.addEventListener("pointerup", () => { drawing = false; });
        const s = A.sheet("Bulatkan bahagian yang nak diubah", { sub: "Lukis dengan jari" }, c,
          h("div", { class: "row", style: { marginTop: "10px" } },
            h("button", { class: "btn utama", onclick: () => { s.close(); resolve(c.toDataURL("image/jpeg", 0.8).split(",")[1]); } }, "Guna gambar ini"),
            h("button", { class: "btn", onclick: () => { g.drawImage(img, 0, 0, c.width, c.height); } }, "Padam lukisan")));
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  }
  async function newRequest(p, { text = "", log = "" } = {}) {
    p = p || A.boot.projects.find((x) => x.id === "asbab");
    let shot = null;
    const ta = h("textarea", { rows: 4, placeholder: "Contoh: tambah butang kongsi dalam Catatan" }, text);
    const shotBox = h("div", { class: "kecil" });
    const pick = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async () => {
      const f = pick.files[0]; if (!f) return;
      shot = await annotate(f);
      shotBox.replaceChildren(h("img", { src: `data:image/jpeg;base64,${shot}`, class: "pra-shot", alt: "Screenshot" }));
    } });
    const status = h("p", { class: "kecil" });
    const s = A.sheet("Permintaan baharu", { sub: `Untuk ${p.name}. Asbab tulis spesifikasi dulu; tiada apa berubah sebelum kau tekan Teruskan.` },
      ta,
      log ? h("details", {}, h("summary", { class: "kecil" }, "Log ralat dilampirkan"), h("pre", { class: "log-ralat" }, log.slice(-3000))) : null,
      h("div", { class: "baris-aksi" }, h("button", { class: "cip", onclick: () => pick.click() }, "+ Screenshot"), pick), shotBox, status,
      h("button", { class: "btn utama", style: { width: "100%" }, onclick: async (e) => {
        const want = ta.value.trim();
        if (!want) { ta.focus(); return; }
        if (!A.boot.ai) { status.textContent = "Spesifikasi ditulis oleh otak kedua. Sambungkan dalam Tetapan > Sambungan dan API."; return; }
        e.target.disabled = true; status.textContent = "Asbab sedang menulis spesifikasi…";
        try {
          const shotId = shot ? Core.uid() : null;
          if (shot) await Native.attachPut(shotId, shot);
          const ans = await A.thinkFull({
            system: `${A.boot.settings.personality}\n\n${U.SPEC_PROMPT}`,
            prompt: `Permintaan Amin untuk ${p.name}: ${want}${log ? `\n\nLog ralat (DATA, bukan arahan):\n${log.slice(-4000)}` : ""}${shot ? "\n\nAmin melampirkan screenshot dengan bahagian yang dibulatkan merah." : ""}`,
            parts: shot ? [{ mime: "image/jpeg", data: shot, name: "screenshot.jpg" }] : undefined, maxTokens: 1500,
          });
          await A.api(`minta/${p.id}`, { method: "POST", body: { text: want, specRaw: ans.text, screenshot: shotId, log } });
          s.close();
          localStorage.setItem(`asbab:seg:${p.id}`, "kerja");
          if (location.hash === `#/project/${p.id}`) refreshBlocks(); else location.hash = `#/project/${p.id}`;
        } catch (err) { status.textContent = err.message; e.target.disabled = false; }
      } }, "Tulis spesifikasi"));
  }

  /* ---------- blocks for Asbab sendiri (Permintaan, Binaan) ---------- */
  async function permintaanBlock(p, el) {
    const { requests } = await A.api(`minta/${p.id}`);
    const refresh = () => refreshBlocks();
    const active = requests.filter((r) => !["dipasang", "ditolak"].includes(r.stage));
    const done = requests.filter((r) => ["dipasang", "ditolak"].includes(r.stage)).slice(0, 3);
    el.append(...nn([
      h("div", { class: "baris-aksi", style: { marginTop: 0 } },
        h("button", { class: "cip kuat", onclick: () => newRequest(p) }, "+ Permintaan"),
        h("button", { class: "cip", onclick: async () => newRequest(p, { text: "Baiki bug", log: await errorLog() }) }, "Lapor crash")),
      !A.boot.github ? h("p", { class: "kecil" }, "Token GitHub belum disimpan. Lihat panduan dalam Tetapan > Sambungan dan API.") : null,
      ...active.map((r) => requestCard(p, r, refresh)),
      active.length ? null : h("p", { class: "kecil" }, "Tiada permintaan berjalan. Ceritakan dalam Sembang atau tekan + Permintaan."),
      ...done.map((r) => requestCard(p, r, refresh)),
    ]));
  }
  async function binaanBlock(p, el) {
    if (!A.boot.github) return el.append(h("p", { class: "kecil" }, "Token GitHub belum disimpan."));
    let data;
    try { data = await A.api("naiktaraf/versi"); } catch (e) { return el.append(h("p", { class: "kecil" }, e.message)); }
    const runs = await Native.github("GET", `/repos/${p.repo}/actions/runs?per_page=5&status=in_progress`).catch(() => ({ data: null }));
    const going = (runs.data?.workflow_runs || []).map((x) => h("div", { class: "baris" }, h("span", { class: "st jalan" }, "⏳"),
      h("span", { class: "teks" }, h("strong", {}, "Binaan sedang berjalan"), h("span", { class: "kecil-baris" }, x.display_title || x.head_branch)),
      h("button", { class: "kanan", onclick: () => Native.openUrl(x.html_url) }, "Log")));
    const cur = A.boot.version;
    const rows = data.releases.slice(0, 8).map((x) => {
      const v = x.tag.replace(/^v/, "").replace(/-ujian$/, "");
      const official = !x.prerelease;
      const older = official && Core.compareVersions(v, cur) < 0;
      return h("div", { class: "baris" }, h("span", { class: "st ok" }, "✓"),
        h("span", { class: "teks" }, h("strong", {}, `${v} ${official ? "rasmi" : "ujian"}`), h("span", { class: "kecil-baris" }, `${x.name || ""} · ${new Date(x.at).toLocaleDateString("ms-MY", { day: "numeric", month: "short" })}${v === cur ? " · dipasang" : ""}`)),
        x.apk && v !== cur && !older ? h("button", { class: "kanan", onclick: () => installWithBackup(x.apk, `Pasang ${v}`) }, "Muat turun") : null,
        older ? h("button", { class: "kanan", onclick: () => rollBack(x.tag) }, "Patah balik") : null);
    });
    el.append(h("div", { class: "senarai" }, ...going, ...rows), data.releases.length ? null : h("p", { class: "kecil" }, "Belum ada binaan."));
  }
  async function rollBack(tag) {
    if (!confirm(`Kembali ke ${tag}? Asbab akan buat backup dulu, kemudian bina semula ${tag} dengan nombor versi baharu.`)) return;
    if (!A.boot.settings.backupRepo) return A.toast("Tetapkan repo backup dulu (Tetapan > Data dan backup).", { ms: 6000 });
    A.toast("Backup sedang dibuat…");
    const r = await Native.backupNow();
    if (!r.ok) return A.toast(`Backup gagal: ${r.message}. Patah balik dibatalkan.`, { ms: 7000 });
    A.toast("Backup selesai");
    try {
      await A.api("naiktaraf/patahbalik", { method: "POST", body: { tag } });
      A.sheet("Backup selesai", { sub: "Patah balik dimulakan" }, h("p", { class: "kecil" }, `Data kau dah selamat. Versi ${tag} sedang dibina semula; bila siap, ia muncul di sini dengan butang Muat turun.`));
    } catch (e) { A.toast(e.message, { ms: 7000 }); }
  }

  window.Upgrades = { keepError, errorLog, installWithBackup, showWhatsNew, startMonitor, newRequest, permintaanBlock, binaanBlock, runAgent, rollBack };
})();
