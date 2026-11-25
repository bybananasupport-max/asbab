// Wallpaper, kaca dan warna aksen. Disimpan dalam peranti ini.
(function () {
  const KEY = "asbab:tema";
  const SECTIONS = [["semua", "Semua"], ["chat", "Chat"], ["hari", "Hari Ini"], ["project", "Project"], ["catatan", "Catatan"]];
  const AKSEN = ["#e8836b", "#6fc2b0", "#a99be0", "#e8a35c", "#7fa8e8", "#e86b9a"];
  const lalai = { asing: false, wall: { semua: { jenis: "alam" } }, blur: 12, gelap: 40, kaca: 55, aksen: AKSEN[0] };

  const load = () => { try { return { ...lalai, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...lalai }; } };
  let t = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(t)); return true; } catch { return false; } };

  function vars() {
    const r = document.documentElement.style;
    r.setProperty("--wall-blur", t.blur + "px");
    r.setProperty("--wall-dim", t.gelap / 100);
    r.setProperty("--kaca", t.kaca / 100);
    r.setProperty("--kaca-blur", Math.round(6 + (t.kaca / 100) * 18) + "px");
    r.setProperty("--aksen", t.aksen);
    r.setProperty("--aksen-2", `color-mix(in srgb, ${t.aksen} 60%, #fff 40%)`);
  }

  let current = "semua";
  function apply(section = current) {
    current = section;
    vars();
    const w = (t.asing && t.wall[section]) || t.wall.semua || { jenis: "alam" };
    const isImg = w.jenis === "gambar" && w.img;
    document.body.classList.toggle("guna-gambar", !!isImg);
    const el = document.getElementById("wall");
    if (el && isImg) el.style.backgroundImage = `url("${w.img}")`;
    return !isImg;
  }

  // Kecilkan gambar supaya muat dalam storan peranti.
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
    SECTIONS, AKSEN,
    get: () => t,
    set(patch) { t = { ...t, ...patch }; const ok = save(); apply(); return ok; },
    setWall(section, wall) { t.wall = { ...t.wall, [section]: wall }; const ok = save(); apply(); return ok; },
    apply, compress,
  };
})();
