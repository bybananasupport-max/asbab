// Alam Asbab: langit, bumi, bulan, bintang, hujan dan kunang-kunang.
(function () {
  const PALET = {
    subuh:   { top: "#1b2350", bot: "#a9b4e0", far: "#2a3363", near: "#161c3d", glow: "#dfe3ff" },
    siang:   { top: "#4f86b8", bot: "#cfe3ee", far: "#5f8c6a", near: "#2f5440", glow: "#ffffff" },
    petang:  { top: "#6c90bd", bot: "#f2d2a0", far: "#5d7a57", near: "#2f4631", glow: "#ffe7c2" },
    maghrib: { top: "#232552", bot: "#e8a35c", far: "#3a2f4f", near: "#1a1629", glow: "#ffcf9e" },
    malam:   { top: "#070b1a", bot: "#1b2547", far: "#141b36", near: "#0a0f22", glow: "#ede6cf" },
  };

  // Still when moving effects are off, or when the scene is not the chosen wallpaper (Phase 6 default = gradient).
  const reduce = () => document.body.classList.contains("ringan") || !document.body.classList.contains("guna-alam") || matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Bulan ----------
  function moonPhase(d = new Date()) {
    const synodic = 29.530588853;
    const ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    const days = d.getTime() / 86400000 - ref;
    return (((days % synodic) + synodic) % synodic) / synodic;
  }
  function moonPath(p, cx, cy, r) {
    const waxing = p < 0.5;
    const f = Math.cos(2 * Math.PI * p);
    const rx = Math.max(0.01, Math.abs(f) * r);
    const s1 = waxing ? 1 : 0;
    const s2 = waxing ? (f > 0 ? 0 : 1) : (f > 0 ? 1 : 0);
    return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${s1} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${s2} ${cx} ${cy - r} Z`;
  }
  function moonSVG(size = 64, phase = moonPhase()) {
    const r = size * 0.36, c = size / 2;
    return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${c}" cy="${c}" r="${r}" fill="#1e2648"/>
      <path d="${moonPath(phase, c, c, r)}" class="lit-path" fill="#ede6cf"/>
    </svg>`;
  }

  // ---------- Bumi ----------
  const tree = (x, y, h) => `<g class="sway"><path class="near" d="M${x} ${y} q 4 ${-h * 0.5} ${2} ${-h} l 3 0 q -1 ${h * 0.5} 3 ${h} z"/>
    ${[-50, -20, 15, 45, 75].map((a) => `<path class="near" transform="rotate(${a} ${x + 3} ${y - h})" d="M${x + 3} ${y - h} q 22 -10 44 6 q -22 -2 -44 -2 z"/>`).join("")}</g>`;
  const shrubs = (n, y) => Array.from({ length: n }, (_, i) => {
    const x = (i / n) * 1000 + (i % 3) * 13;
    return `<path class="near sway" d="M${x} ${y} q 6 -38 14 -46 q -2 30 4 46 q 8 -30 18 -36 q -6 24 -2 36 z"/>`;
  }).join("");

  const LAND = {
    gunung: () => `
      <path class="far" d="M0 300 L120 190 L220 250 L340 120 L470 240 L560 170 L700 260 L820 150 L1000 280 L1000 500 L0 500 Z"/>
      <rect class="mist" x="-50" y="250" width="1100" height="60" rx="30"/>
      <path class="near" d="M0 380 Q150 300 300 350 T620 330 T1000 360 L1000 500 L0 500 Z"/>
      ${shrubs(26, 470)}`,
    kampung: () => `
      <path class="far" d="M0 330 Q250 250 500 300 T1000 290 L1000 500 L0 500 Z"/>
      <rect class="mist" x="-50" y="300" width="1100" height="50" rx="25"/>
      <path class="near" d="M0 410 Q300 380 600 400 T1000 395 L1000 500 L0 500 Z"/>
      <g class="near"><rect x="620" y="330" width="120" height="60"/><path d="M600 332 L680 280 L760 332 Z"/>
        <rect x="630" y="390" width="6" height="22"/><rect x="725" y="390" width="6" height="22"/></g>
      <rect x="650" y="345" width="16" height="16" fill="#f2c57a" opacity="0.85"/>
      ${tree(120, 420, 170)}${tree(230, 425, 140)}${tree(880, 415, 180)}
      ${shrubs(18, 495)}`,
    sungai: () => `
      <path class="far" d="M0 300 Q200 230 420 280 T1000 260 L1000 500 L0 500 Z"/>
      <path class="near" d="M0 360 Q300 330 520 360 T1000 350 L1000 380 L0 380 Z"/>
      <rect x="0" y="378" width="1000" height="70" fill="var(--sky-bot)" opacity="0.55"/>
      <rect x="760" y="390" width="36" height="3" fill="var(--glow)" opacity="0.5"/><rect x="770" y="402" width="20" height="2" fill="var(--glow)" opacity="0.4"/>
      <path class="near" d="M0 445 Q400 430 1000 450 L1000 500 L0 500 Z"/>
      ${shrubs(30, 470)}`,
    bukit: () => `
      <path class="far" d="M0 320 Q160 240 330 300 Q520 360 700 270 Q860 210 1000 290 L1000 500 L0 500 Z"/>
      <rect class="mist" x="-50" y="300" width="1100" height="40" rx="20"/>
      <path class="near" d="M0 420 Q250 360 520 410 Q760 450 1000 400 L1000 500 L0 500 Z"/>
      <g class="sway"><rect class="near" x="296" y="300" width="8" height="92"/><circle class="near" cx="300" cy="290" r="40"/><circle class="near" cx="270" cy="310" r="28"/><circle class="near" cx="332" cy="308" r="30"/></g>
      ${shrubs(22, 480)}`,
  };

  let el, starCanvas, rainCanvas, currentScene = null, raining = false, stars = [];

  function build() {
    el = document.getElementById("scene");
    el.innerHTML = `<div class="camera">
      <div class="sky"></div>
      <canvas id="stars"></canvas>
      <div class="moon">${moonSVG()}</div>
      <div class="land"></div>
      <canvas id="rain"></canvas>
    </div>`;
    starCanvas = el.querySelector("#stars");
    rainCanvas = el.querySelector("#rain");
    resize();
    addEventListener("resize", resize);
    requestAnimationFrame(tick);
  }

  function resize() {
    for (const c of [starCanvas, rainCanvas]) { c.width = innerWidth; c.height = innerHeight * 2; }
    stars = Array.from({ length: Math.round((innerWidth * innerHeight) / 2600) }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight * 1.55,
      r: Math.random() * 1.3 + 0.2, t: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.6,
    }));
  }

  let last = 0;
  function tick(ts) {
    const dt = Math.min(64, ts - last); last = ts;
    const sc = starCanvas.getContext("2d");
    sc.clearRect(0, 0, starCanvas.width, starCanvas.height);
    const still = reduce();
    const nightness = Number(getComputedStyle(document.documentElement).getPropertyValue("--bintang") || 1);
    for (const s of stars) {
      if (!still) s.t += (dt / 1000) * s.s;
      const deep = s.y < innerHeight;
      const a = (deep ? 0.9 : 0.7 * nightness) * (0.55 + 0.45 * Math.sin(s.t));
      sc.fillStyle = `rgba(237,230,207,${a})`;
      sc.beginPath(); sc.arc(s.x, s.y, s.r, 0, Math.PI * 2); sc.fill();
    }
    const rc = rainCanvas.getContext("2d");
    rc.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
    if (raining && !still) {
      rc.strokeStyle = "rgba(200,210,235,0.35)";
      rc.lineWidth = 1;
      for (let i = 0; i < 120; i++) {
        const x = (Math.random() * innerWidth * 1.2) - 40;
        const y = innerHeight + Math.random() * innerHeight;
        rc.beginPath(); rc.moveTo(x, y); rc.lineTo(x - 4, y + 16); rc.stroke();
      }
    }
    // Moving effects off (default since Phase 5.2): redraw rarely instead of 60 times a second.
    if (still) setTimeout(() => requestAnimationFrame(tick), 1500);
    else requestAnimationFrame(tick);
  }

  function setScene(type) {
    if (!LAND[type] || type === currentScene) return;
    const land = el.querySelector(".land");
    const fresh = document.createElement("div");
    fresh.className = "land masuk";
    fresh.innerHTML = `<svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMax slice">${LAND[type]()}</svg>`;
    land.after(fresh);
    land.classList.add("keluar");
    requestAnimationFrame(() => requestAnimationFrame(() => fresh.classList.remove("masuk")));
    setTimeout(() => land.remove(), 1900);
    currentScene = type;
  }

  function setPeriod(name) {
    const p = PALET[name] || PALET.malam;
    const root = document.documentElement.style;
    root.setProperty("--sky-top", p.top);
    root.setProperty("--sky-bot", p.bot);
    root.setProperty("--land-far", p.far);
    root.setProperty("--land-near", p.near);
    root.setProperty("--glow", p.glow);
    root.setProperty("--bintang", name === "malam" ? 1 : name === "subuh" || name === "maghrib" ? 0.45 : 0);
    const moon = el.querySelector(".moon");
    if (moon) moon.style.opacity = name === "siang" || name === "petang" ? 0.25 : 1;
  }

  function periodFrom(pt, now = new Date()) {
    if (!pt) {
      const h = now.getHours();
      return h < 6 ? "malam" : h < 8 ? "subuh" : h < 16 ? "siang" : h < 19 ? "petang" : h < 20 ? "maghrib" : "malam";
    }
    const m = now.getHours() * 60 + now.getMinutes();
    const t = (s) => { const [h, mm] = s.split(":").map(Number); return h * 60 + mm; };
    if (m < t(pt.fajr)) return "malam";
    if (m < t(pt.syuruk) + 30) return "subuh";
    if (m < t(pt.asr)) return "siang";
    if (m < t(pt.maghrib) - 15) return "petang";
    if (m < t(pt.isha) + 20) return "maghrib";
    return "malam";
  }

  function setRain(on) { raining = !!on; }
  function sky(on) { document.body.classList.toggle("di-langit", !!on); }

  function fireflies(target, n = 10) {
    if (reduce() || !target) return;
    const r = target.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const f = document.createElement("div");
      f.className = "firefly";
      const sx = r.left + Math.random() * r.width * 1.6 - r.width * 0.3;
      const sy = r.top + Math.random() * 120 - 60;
      f.style.left = sx + "px"; f.style.top = sy + "px";
      document.body.append(f);
      const tx = r.left + Math.random() * r.width, ty = r.top + Math.random() * r.height;
      f.animate([{ transform: "translate(0,0)", opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: `translate(${tx - sx}px, ${ty - sy}px)`, opacity: 0 }], { duration: 900 + Math.random() * 400, easing: "ease-in" }).onfinish = () => f.remove();
    }
  }

  let leafCool = 0;
  function leaf() {
    if (reduce() || Date.now() - leafCool < 500) return;
    leafCool = Date.now();
    const l = document.createElement("div");
    l.className = "leaf";
    l.style.left = Math.random() * innerWidth + "px";
    l.style.animationDuration = 4 + Math.random() * 3 + "s";
    document.body.append(l);
    setTimeout(() => l.remove(), 7500);
  }

  window.Scene = { build, setScene, setPeriod, periodFrom, setRain, sky, fireflies, leaf, moonSVG, moonPhase };
})();
