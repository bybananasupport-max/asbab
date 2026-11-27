// Look and feel (Phase 6): theme presets, custom colours, font, wallpaper per section, blur/dim/glass.
// Saved on this phone only (localStorage "asbab:tema"); the colours are also shared with the floating moon.
(function () {
  const KEY = "asbab:tema";
  const SECTIONS = [["semua", "Semua"], ["chat", "Chat"], ["hari", "Hari Ini"], ["project", "Project"], ["catatan", "Catatan"]];

  // One-tap themes. bg = base colour, glow1/glow2 = the two soft lights, aksen = buttons and highlights.
  const PRESETS = {
    aurora: { nama: "Aurora", mode: "gelap", bg: "#0b1022", glow1: "#3b5bdb", glow2: "#12b886", aksen: "#63e6be" },
    emas: { nama: "Malam emas", mode: "gelap", bg: "#0d0d0f", glow1: "#b08900", glow2: "#5c3d00", aksen: "#ffd43b" },
    laut: { nama: "Laut dalam", mode: "gelap", bg: "#06141f", glow1: "#0b7285", glow2: "#1c3d6e", aksen: "#66d9e8" },
    senja: { nama: "Senja", mode: "gelap", bg: "#1a0f1f", glow1: "#e8590c", glow2: "#862e9c", aksen: "#ffa94d" },
    hutan: { nama: "Hutan", mode: "gelap", bg: "#0b140e", glow1: "#2b8a3e", glow2: "#5c940d", aksen: "#8ce99a" },
    cerah: { nama: "Kaca cerah", mode: "cerah", bg: "#eef1f7", glow1: "#a5d8ff", glow2: "#ffc9c9", aksen: "#4263eb" },
  };

  const FONTS = {
    telefon: { nama: "Fon telefon", css: 'system-ui, -apple-system, "Roboto", "Segoe UI", sans-serif' },
    serif: { nama: "Serif", css: '"Noto Serif", "Source Serif Pro", Georgia, serif' },
    bulat: { nama: "Bulat", css: '"Nunito", "Varela Round", system-ui, sans-serif', url: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" },
    taip: { nama: "Mesin taip", css: '"Courier Prime", "Courier New", monospace', url: "https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap" },
  };

  // preset "auto" follows the phone's dark/light mode (Aurora or Kaca cerah).
  const lalai = { preset: "auto", custom: null, font: "telefon", asing: false, wall: { semua: { jenis: "gradien" } }, blur: 14, gelap: 35, kaca: 55 };

  const load = () => {
    try {
      const t = { ...lalai, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
      // Before Phase 6 the default wallpaper was the living moon scene ("alam"); the new default is the gradient.
      if (!t.v6) { t.v6 = true; if (t.wall?.semua?.jenis === "alam") t.wall = { ...t.wall, semua: { jenis: "gradien" } }; }
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

  function vars() {
    const c = colours();
    const r = document.documentElement.style;
    const light = c.mode === "cerah";
    document.documentElement.classList.toggle("cerah", light);
    r.setProperty("--bg", c.bg);
    r.setProperty("--glow1", c.glow1);
    r.setProperty("--glow2", c.glow2);
    r.setProperty("--aksen", c.aksen);
    r.setProperty("--aksen-2", `color-mix(in srgb, ${c.aksen} 65%, ${light ? "#000" : "#fff"} 35%)`);
    r.setProperty("--font", loadFont(t.font));
    r.setProperty("--wall-blur", t.blur + "px");
    r.setProperty("--wall-dim", t.gelap / 100);
    r.setProperty("--kaca", t.kaca / 100);
    r.setProperty("--kaca-blur", Math.round(8 + (t.kaca / 100) * 16) + "px");
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
