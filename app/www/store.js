// Asbab key-value store, kept on this phone only.
// Phase 1: backed by the WebView's localStorage. Phase 2 swaps the backend to SQLite
// without changing this async interface (get / put / del / keys).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Store = api;
})(typeof self !== "undefined" ? self : this, function () {
  const PREFIX = "asbab:db:";

  // `backend` is anything with getItem / setItem / removeItem / key / length (localStorage, or a test fake).
  function createStore(backend) {
    const k = (key) => PREFIX + key;
    return {
      async get(key, fallback = null) {
        const raw = backend.getItem(k(key));
        if (raw == null) return fallback;
        try { return JSON.parse(raw); } catch { return fallback; }
      },
      async put(key, value) {
        backend.setItem(k(key), JSON.stringify(value));
        return value;
      },
      async del(key) {
        backend.removeItem(k(key));
      },
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

  // Simple in-memory backend, used by unit tests.
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

  return { createStore, memoryBackend };
});
