// Second brain providers (Phase 5.1): Gemini, Claude and OpenAI.
// Mirrors core/Ai.kt (Kotlin), which does the real requests. To add a provider: add an entry here and an
// object in core/Ai.kt (Providers.ALL) with the same id.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Ai = api;
})(typeof self !== "undefined" ? self : this, function () {
  const PROVIDERS = [
    {
      id: "gemini", label: "Gemini", site: "aistudio.google.com", keyHint: "Key API Gemini (bermula dengan AIza)",
      help: "Dapatkan key percuma di aistudio.google.com > Get API key. Tier percuma ada had permintaan sehari yang kecil.",
      privacy: "Tier percuma Gemini: Google mungkin menggunakan data yang dihantar untuk menambah baik produknya, dan manusia mungkin menyemaknya. Jangan hantar maklumat sensitif semasa guna tier percuma.",
      fallbackChat: "", fallbackCoding: "", cap: 20,
    },
    {
      id: "claude", label: "Claude", site: "console.anthropic.com", keyHint: "Key API Claude (bermula dengan sk-ant-)",
      help: "Dapatkan key di console.anthropic.com > API Keys. Bayaran ikut penggunaan.",
      privacy: "", fallbackChat: "claude-haiku-5-5", fallbackCoding: "claude-sonnet-5-5", cap: 60,
    },
    {
      id: "openai", label: "OpenAI", site: "platform.openai.com", keyHint: "Key API OpenAI (bermula dengan sk-)",
      help: "Dapatkan key di platform.openai.com > API keys. Bayaran ikut penggunaan (perlu kredit).",
      privacy: "", fallbackChat: "", fallbackCoding: "", cap: 60,
    },
  ];
  const IDS = PROVIDERS.map((p) => p.id);
  const DEFAULT_ORDER = ["gemini", "claude", "openai"];
  const byId = (id) => PROVIDERS.find((p) => p.id === id) || null;

  // settings.ai with every field filled in. Older settings are migrated (Claude keeps its models and cap).
  function config(s = {}) {
    const ai = s.ai || {};
    const provs = ai.providers || {};
    const providers = {};
    for (const p of PROVIDERS) {
      const o = provs[p.id] || {};
      const legacyChat = p.id === "claude" ? s.modelLight : "";
      const legacyCoding = p.id === "claude" ? s.modelHeavy : "";
      providers[p.id] = {
        on: o.on !== false,
        chatModel: o.chatModel || legacyChat || p.fallbackChat,
        codingModel: o.codingModel || legacyCoding || p.fallbackCoding,
        cap: Number.isFinite(Number(o.cap)) && o.cap !== "" && o.cap != null ? Math.max(0, Math.min(10000, Number(o.cap))) : (p.id === "gemini" ? p.cap : (s.aiDailyCap ?? p.cap)),
        personal: o.personal === true,
      };
    }
    const role = (r) => (byId(ai.roles && ai.roles[r]) ? ai.roles[r] : "gemini");
    const order = [...(ai.order || []), ...DEFAULT_ORDER].filter((id, i, a) => byId(id) && a.indexOf(id) === i);
    return { roles: { chat: role("chat"), coding: role("coding") }, order, providers };
  }

  // Providers to try for a role, same rules as AiConfig.chain in Kotlin.
  // prefer = a provider chosen for one chat room ("auto" or empty = the role's provider).
  function chain(s, role, { personal = false, keys = {}, used = {}, prefer = "" } = {}) {
    if (s.aiEnabled === false) return [];
    const c = config(s);
    const first = byId(prefer) ? prefer : c.roles[role];
    const ids = [first, ...c.order, ...IDS].filter((id, i, a) => id && a.indexOf(id) === i);
    return ids.filter((id) => {
      const p = c.providers[id];
      return p && p.on && keys[id] && (used[id] || 0) < p.cap && (!personal || p.personal);
    });
  }

  // Attachment kinds each provider reads (same as ProviderSpec.reads in Kotlin, Phase 6.2).
  const READS = { gemini: ["image", "pdf", "video"], claude: ["image", "pdf"], openai: ["image", "pdf"] };
  const kindOf = (mime) => (/^image\//.test(mime) ? "image" : /^video\//.test(mime) ? "video" : mime === "application/pdf" ? "pdf" : "other");
  // Chain for a message with attachments: only providers that read every kind. switchedFrom = the provider
  // that would have answered but cannot read them (so Asbab can say which one it used instead).
  function chainFor(s, role, opts = {}, kinds = []) {
    const all = chain(s, role, opts);
    if (!kinds.length) return { ids: all, switchedFrom: null };
    const ids = all.filter((id) => kinds.every((k) => (READS[id] || []).includes(k)));
    return { ids, switchedFrom: all[0] && all[0] !== ids[0] ? all[0] : null };
  }

  // Is any second brain usable at all (switched on and has a key)?
  function ready(s, keys = {}) {
    if (s.aiEnabled === false) return false;
    const c = config(s);
    return IDS.some((id) => c.providers[id].on && keys[id]);
  }

  // Label on an answer: "otak kedua: Gemini" or "otak kedua: Claude (sandaran)".
  // Messages saved before Phase 5.1 have no provider; they were all Claude.
  function label(m) {
    const name = m.provider ? (byId(m.provider)?.label || m.provider) : "Claude";
    return `otak kedua: ${name}${m.fallback ? " (sandaran)" : ""}`;
  }

  // Sum of the daily caps of providers that can be used (for the usage ring on Hari Ini and the moon button).
  function totalCap(s, keys = {}) {
    const c = config(s);
    return IDS.filter((id) => c.providers[id].on && keys[id]).reduce((a, id) => a + c.providers[id].cap, 0);
  }

  // Providers that can answer right now (switched on and have a key), for the chat's AI picker.
  function active(s, keys = {}) {
    if (s.aiEnabled === false) return [];
    const c = config(s);
    return [...c.order, ...IDS].filter((id, i, a) => a.indexOf(id) === i && c.providers[id].on && keys[id]);
  }

  return { PROVIDERS, IDS, DEFAULT_ORDER, byId, config, chain, ready, label, totalCap, active , READS, kindOf, chainFor };
});
