// Asbab key-value store, kept on this phone only.
// Values are JSON. Every method is async.
//
// - createStore(localStorage-like): Phase 1 backend, still used in a normal browser and in tests.
// - createNativeStore(plugin): Phase 2+ backend, the app's SQLite database (shared with the
//   Kotlin side so reminders work while the app is closed).
// - migrateLocalToNative(): one-time copy of Phase 1 data into SQLite.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Store = api;
})(typeof self !== "undefined" ? self : this, function () {
  const PREFIX = "asbab:db:";
  const MIGRATED = "_migrated:localStorage";

  const parse = (raw, fallback) => {
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  };

  // `backend` has getItem / setItem / removeItem / key / length (localStorage, or memoryBackend()).
  function createStore(backend) {
    const k = (key) => PREFIX + key;
    return {
      async get(key, fallback = null) { return parse(backend.getItem(k(key)), fallback); },
      async put(key, value) { backend.setItem(k(key), JSON.stringify(value)); return value; },
      async del(key) { backend.removeItem(k(key)); },
      async keys(prefix = "") {
        const out = [];
        for (let i = 0; i < backend.length; i++) {
          const full = backend.key(i);
          if (full && full.startsWith(PREFIX + prefix)) out.push(full.slice(PREFIX.length));
        }
        return out;
      },
    };
  }

  // `plugin` is the native AsbabNative plugin: dbGet({key}) -> {value}, dbPut({key, value}),
  // dbDel({key}), dbKeys({prefix}) -> {keys}. Values travel as JSON strings.
  function createNativeStore(plugin) {
    return {
      async get(key, fallback = null) { return parse((await plugin.dbGet({ key })).value, fallback); },
      async put(key, value) { await plugin.dbPut({ key, value: JSON.stringify(value) }); return value; },
      async del(key) { await plugin.dbDel({ key }); },
      async keys(prefix = "") { return (await plugin.dbKeys({ prefix })).keys || []; },
    };
  }

  // Copies every Phase 1 record from localStorage into `target`, once, then frees localStorage
  // (so there is more room for wallpapers). Returns how many records were copied.
  async function migrateLocalToNative(local, target) {
    if (await target.get(MIGRATED, false)) return 0;
    const source = createStore(local);
    const keys = await source.keys("");
    for (const key of keys) {
      // Never overwrite something the native side already has (e.g. proactive messages).
      if ((await target.get(key, null)) == null) await target.put(key, await source.get(key));
    }
    await target.put(MIGRATED, Date.now());
    for (const key of keys) await source.del(key);
    return keys.length;
  }

  // Simple in-memory localStorage, used by unit tests.
  function memoryBackend() {
    const m = new Map();
    return {
      getItem: (key) => (m.has(key) ? m.get(key) : null),
      setItem: (key, v) => m.set(key, String(v)),
      removeItem: (key) => m.delete(key),
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    };
  }

  // In-memory imitation of the native plugin, used by unit tests.
  function memoryPlugin() {
    const m = new Map();
    return {
      async dbGet({ key }) { return { value: m.has(key) ? m.get(key) : null }; },
      async dbPut({ key, value }) { m.set(key, value); },
      async dbDel({ key }) { m.delete(key); },
      async dbKeys({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix || "")) }; },
    };
  }

  return { createStore, createNativeStore, migrateLocalToNative, memoryBackend, memoryPlugin, PREFIX };
});
