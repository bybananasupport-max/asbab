// Encrypted backup format (version 1), shared with the Kotlin daily backup (core/Backup.kt):
//   { "asbab": "backup", "v": 1, "kdf": "PBKDF2-SHA256", "iter": 200000,
//     "salt": base64(16 bytes), "iv": base64(12 bytes), "data": base64(AES-256-GCM ciphertext + tag) }
// The plaintext is the identity export: { asbab: "identiti", version, exportedAt, data: { key: value } }.
// The key comes from Amin's backup passphrase, so a backup can be restored on a new phone.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Backup = api;
})(typeof self !== "undefined" ? self : this, function () {
  const ITER = 200000;
  const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;

  const toB64 = (bytes) => {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  async function deriveKey(passphrase, salt, iter) {
    const base = await subtle().importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  const isEncrypted = (obj) => !!(obj && obj.asbab === "backup" && obj.v === 1 && obj.data && obj.salt && obj.iv);

  // opts.salt / opts.iv / opts.iter are only for tests (fixed vectors); normally random.
  async function encrypt(plain, passphrase, opts = {}) {
    if (!passphrase || String(passphrase).length < 8) throw new Error("Frasa laluan backup mesti sekurang-kurangnya 8 aksara.");
    const salt = opts.salt || globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = opts.iv || globalThis.crypto.getRandomValues(new Uint8Array(12));
    const iter = opts.iter || ITER;
    const key = await deriveKey(passphrase, salt, iter);
    const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(plain))));
    return { asbab: "backup", v: 1, kdf: "PBKDF2-SHA256", iter, salt: toB64(salt), iv: toB64(iv), data: toB64(ct) };
  }

  async function decrypt(file, passphrase) {
    if (!isEncrypted(file)) throw new Error("Fail ni bukan backup Asbab yang disulitkan.");
    if (file.kdf !== "PBKDF2-SHA256") throw new Error("Format backup tak dikenali.");
    const key = await deriveKey(passphrase, fromB64(file.salt), file.iter || ITER);
    let plain;
    try {
      plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(file.iv) }, key, fromB64(file.data));
    } catch {
      throw new Error("Frasa laluan salah, atau fail backup rosak.");
    }
    return JSON.parse(new TextDecoder().decode(plain));
  }

  // Keys that never go into a backup: caches, reminder bookkeeping, raw data from other apps.
  const skipKey = (k) => /^(prayer:|sent:|proactive:|_|ingest$)/.test(k);

  return { encrypt, decrypt, isEncrypted, skipKey, ITER, toB64, fromB64 };
});
