import { describe, it, expect } from "vitest";
import Backup from "../www/backup.js";

const plain = { asbab: "identiti", version: "0.5.0", exportedAt: "2026-11-26T00:00:00.000Z", data: { notes: [{ title: "Kelas", amount: 12.5 }], settings: { name: "Amin" } } };

describe("backup format v1", () => {
  it("encrypts and decrypts with the passphrase", async () => {
    const file = await Backup.encrypt(plain, "frasa rahsia amin", { iter: 1000 });
    expect(file).toMatchObject({ asbab: "backup", v: 1, kdf: "PBKDF2-SHA256", iter: 1000 });
    expect(JSON.stringify(file)).not.toContain("Kelas");
    expect(Backup.isEncrypted(file)).toBe(true);
    expect(await Backup.decrypt(file, "frasa rahsia amin")).toEqual(plain);
  });

  it("rejects a wrong passphrase, tampering and weak passphrases", async () => {
    const file = await Backup.encrypt(plain, "frasa rahsia amin", { iter: 1000 });
    await expect(Backup.decrypt(file, "salah salah")).rejects.toThrow("Frasa laluan salah");
    const bad = { ...file, data: file.data.slice(0, -4) + "AAAA" };
    await expect(Backup.decrypt(bad, "frasa rahsia amin")).rejects.toThrow("Frasa laluan salah");
    await expect(Backup.encrypt(plain, "pendek")).rejects.toThrow("8 aksara");
    await expect(Backup.decrypt({ hello: 1 }, "x")).rejects.toThrow("bukan backup");
  });

  it("uses random salt and iv every time", async () => {
    const a = await Backup.encrypt(plain, "frasa rahsia amin", { iter: 1000 });
    const b = await Backup.encrypt(plain, "frasa rahsia amin", { iter: 1000 });
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  });

  it("matches the fixed vector shared with the Kotlin daily backup", async () => {
    // Same inputs as BackupTest.kt: if either side changes the format, one of the tests fails.
    const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
    const iv = Uint8Array.from({ length: 12 }, (_, i) => 100 + i);
    const file = await Backup.encrypt({ a: 1 }, "asbab-ujian-123", { salt, iv, iter: 1000 });
    expect(file.data).toBe(VECTOR);
  });

  it("never backs up caches, bookkeeping or raw data from other apps", () => {
    for (const k of ["prayer:KDH01:2026-11-26", "sent:x", "proactive:2026-11-26", "_paused", "ingest"]) expect(Backup.skipKey(k)).toBe(true);
    for (const k of ["notes", "settings", "msgs:utama", "rooms", "projects", "devlog", "solat:2026-11-26", "ingestion"]) expect(Backup.skipKey(k)).toBe(false);
  });
});

const VECTOR = "aacBWEv7ad9WWfYYPCQtcYBx9T0JzMk=";
