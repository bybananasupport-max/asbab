// Look and feel (Phase 6): theme presets, custom colours, font, wallpaper per section, blur/dim/glass.
// Saved on this phone only (localStorage "asbab:tema"); the colours are also shared with the floating moon.
(function () {
  const KEY = "asbab:tema";
  const SECTIONS = [["semua", "Semua"], ["chat", "Chat"], ["hari", "Hari Ini"], ["project", "Project"], ["catatan", "Catatan"]];

  // One-tap themes. bg = base colour, glow1/glow2 = the two soft lights, aksen = buttons and highlights.
  // Same values as the approved preview (asbab-ui-pratonton.html). glow1/glow2/glow3 = the three soft light blobs.
  const PRESETS = {
    aurora: { nama: "Aurora", mode: "gelap", bg: "#0b1022", aksen: "#5fd3c0", glow1: "#8b7cf0", glow2: "#2e9c8f", glow3: "#3b4fa8" },
    emas: { nama: "Malam emas", mode: "gelap", bg: "#0d0d0f", aksen: "#f5c542", glow1: "#a8781a", glow2: "#3a2c08", glow3: "#5c4512" },
    laut: { nama: "Laut dalam", mode: "gelap", bg: "#06141f", aksen: "#4cc2ff", glow1: "#1b5fa8", glow2: "#0e7c8c", glow3: "#123a6b" },
    senja: { nama: "Senja", mode: "gelap", bg: "#1a0f1c", aksen: "#ff9f6b", glow1: "#c2457a", glow2: "#e0783c", glow3: "#5b2a6e" },
    hutan: { nama: "Hutan", mode: "gelap", bg: "#0a140f", aksen: "#8fd16a", glow1: "#2f7a4a", glow2: "#4f6b1e", glow3: "#1d4a3a" },
    cerah: { nama: "Kaca cerah", mode: "cerah", bg: "#e9edf5", aksen: "#3b5bdb", glow1: "#b8c4ff", glow2: "#9be0d4", glow3: "#ffd6e0" },
  };

  const FONTS = {
    telefon: { nama: "Fon telefon (lalai), ikut tetapan telefon kau", pendek: "Fon telefon", css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    serif: { nama: "Serif klasik", pendek: "Serif klasik", css: 'Georgia, "Noto Serif", serif' },
    bulat: { nama: "Bulat mesra", pendek: "Bulat mesra", css: '"Nunito", "Varela Round", system-ui, sans-serif', url: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" },
    taip: { nama: "Mesin taip", pendek: "Mesin taip", css: 'ui-monospace, "Roboto Mono", monospace' },
  };

  // preset "auto" follows the phone's dark/light mode (Aurora or Kaca cerah).
  const lalai = { preset: "auto", custom: null, font: "telefon", asing: false, wall: { semua: { jenis: "gradien" } }, blur: 8, gelap: 35, kaca: 50 };

  const load = () => {
    try {
      const t = { ...lalai, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
      // Before Phase 6 the default wallpaper was the living moon scene ("alam"); the new default is the gradient.
      if (!t.v6) { t.v6 = true; if (t.wall?.semua?.jenis === "alam") t.wall = { ...t.wall, semua: { jenis: "gradien" } }; }
      // Phase 6.2: the old untouched defaults (blur 14, glass 55) move to the preview's defaults (8, 50).
      if (!t.v62) { t.v62 = true; if (t.blur === 14 && t.kaca === 55) { t.blur = 8; t.kaca = 50; } }
      return t;
    } catch { return { ...lalai }; }
  };
  let t = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(t)); return true; } catch { return false; } };

  const dark = matchMedia("(prefers-color-scheme: dark)");
  function colours() {
    if (t.preset === "custom" && t.custom) return { mode: t.custom.mode || "gelap", ...t.custom };
    if (t.preset !== "auto" && PRESETS[t.preset]) return PRESETS[t.preset];
    return dark.matches ? PRESETS.aurora : PRESETS.cerah;
  }

  function loadFont(f) {
    const def = FONTS[f] || FONTS.telefon;
    if (def.url && !document.querySelector(`link[data-font="${f}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = def.url; l.setAttribute("data-font", f);
      document.head.append(l);
    }
    return def.css;
  }

  // Same rules as terap() in the preview: text, card, line and glass colours follow the theme and the glass slider.
  function vars() {
    const c = colours();
    const r = document.documentElement.style;
    const light = c.mode === "cerah";
    const k = t.kaca / 100;
    document.documentElement.classList.toggle("cerah", light);
    r.setProperty("--bg", c.bg);
    r.setProperty("--aksen", c.aksen);
    r.setProperty("--b1", c.glow1);
    r.setProperty("--b2", c.glow2);
    r.setProperty("--b3", c.glow3 || (PRESETS[t.preset] || PRESETS.aurora).glow3);
    r.setProperty("--glow1", c.glow1);
    r.setProperty("--glow2", c.glow2);
    r.setProperty("--teks", light ? "#151a30" : "#eef0f6");
    r.setProperty("--pudar", light ? "#5c6382" : "#a3a8c3");
    r.setProperty("--kad", light ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.055)");
    r.setProperty("--garis", light ? "rgba(20,26,48,.1)" : "rgba(255,255,255,.12)");
    r.setProperty("--kaca", light ? `rgba(255,255,255,${(0.35 + k * 0.4).toFixed(3)})` : `rgba(255,255,255,${(0.03 + k * 0.1).toFixed(3)})`);
    r.setProperty("--aksen-2", `color-mix(in srgb, ${c.aksen} 65%, ${light ? "#000" : "#fff"} 35%)`);
    r.setProperty("--font", loadFont(t.font));
    r.setProperty("--fon", "var(--font)");
    r.setProperty("--wall-blur", t.blur + "px");
    r.setProperty("--wall-dim", t.gelap / 100);
    r.setProperty("--gelap", t.gelap / 100);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", c.bg);
    // The floating moon over other apps uses the same colours.
    window.Native?.rememberTheme?.({ aksen: c.aksen, glow1: c.glow1, glow2: c.glow2, bg: c.bg });
  }

  let current = "semua";
  // Returns true when the living moon scene is showing for this section.
  function apply(section = current) {
    current = section;
    vars();
    const w = (t.asing && t.wall[section]) || t.wall.semua || { jenis: "gradien" };
    const isImg = w.jenis === "gambar" && w.img;
    document.body.classList.toggle("guna-gambar", !!isImg);
    document.body.classList.toggle("guna-alam", w.jenis === "alam");
    const el = document.getElementById("wall");
    if (el) el.style.backgroundImage = isImg ? `url("${w.img}")` : "";
    return w.jenis === "alam";
  }
  dark.addEventListener?.("change", () => apply());

  // Shrink a gallery picture so it fits in the phone's storage.
  function compress(file, max = 1600) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.8));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => rej(new Error("Gambar tak dapat dibaca."));
      img.src = URL.createObjectURL(file);
    });
  }

  window.Theme = {
    SECTIONS, PRESETS, FONTS,
    get: () => t,
    colours,
    set(patch) { t = { ...t, ...patch }; const ok = save(); apply(); return ok; },
    setWall(section, wall) { t.wall = { ...t.wall, [section]: wall }; const ok = save(); apply(); return ok; },
    apply, compress,
  };
})();
