import { describe, it, expect } from "vitest";
import Store from "../www/store.js";

describe("store", () => {
  it("native store round-trips JSON", async () => {
    const s = Store.createNativeStore(Store.memoryPlugin());
    await s.put("notes", [{ id: 1 }]);
    expect(await s.get("notes")).toEqual([{ id: 1 }]);
    expect(await s.get("tiada", "lalai")).toBe("lalai");
    await s.put("msgs:utama", []);
    expect((await s.keys("msgs:")).sort()).toEqual(["msgs:utama"]);
    await s.del("notes");
    expect(await s.get("notes")).toBeNull();
  });

  it("moves Phase 1 data into SQLite once, without overwriting newer native data", async () => {
    const local = Store.memoryBackend();
    const old = Store.createStore(local);
    await old.put("notes", [{ title: "dari fasa 1" }]);
    await old.put("msgs:utama", [{ text: "lama" }]);
    const native = Store.createNativeStore(Store.memoryPlugin());
    await native.put("msgs:utama", [{ text: "baru dari Kotlin" }]);

    expect(await Store.migrateLocalToNative(local, native)).toBe(2);
    expect(await native.get("notes")).toEqual([{ title: "dari fasa 1" }]);
    expect(await native.get("msgs:utama")).toEqual([{ text: "baru dari Kotlin" }]);
    expect(local.length).toBe(0);

    await old.put("notes", [{ title: "jangan salin lagi" }]);
    expect(await Store.migrateLocalToNative(local, native)).toBe(0);
    expect(await native.get("notes")).toEqual([{ title: "dari fasa 1" }]);
  });
});
