import { describe, it, expect, beforeEach } from "vitest";
import Core from "../www/core.js";
import Store from "../www/store.js";
import LocalApi from "../www/localapi.js";

describe("spending limits (phase 6.1)", () => {
  it("levels match the Kotlin rules", () => {
    expect(Core.budgetLevel(10, 0)).toBeNull();
    expect(Core.budgetLevel(23.9, 30)).toBeNull();
    expect(Core.budgetLevel(24, 30)).toBe("near");
    expect(Core.budgetLevel(30, 30)).toBe("near");
    expect(Core.budgetLevel(30.5, 30)).toBe("over");
    expect(Core.budgetMessage("near", "hari ni", 24, 30)).toBe("Belanja hari ni dah 80% daripada had (RM24.00 / RM30.00).");
  });

  let api;
  const clock = () => new Date("2026-11-27T04:00:00Z");
  beforeEach(() => { api = LocalApi.createLocalApi({ store: Store.createStore(Store.memoryBackend()), clock }); });

  it("warns gently under the chat reply and in the save result", async () => {
    await api("settings", { method: "PUT", body: { belanjaHad: { harian: 20, bulanan: 0 } } });
    let d = await api("chat", { method: "POST", body: { roomId: "utama", text: "belanja RM10 nasi" } });
    expect(d.messages[0].text).not.toContain("had");
    d = await api("chat", { method: "POST", body: { roomId: "utama", text: "belanja RM7 teh" } });
    expect(d.messages[0].text).toContain("Belanja hari ni dah 85% daripada had");
    const r = await api("notes", { method: "POST", body: { kind: "belanja", title: "Minyak", amount: 10 } });
    expect(r.budget).toContain("melebihi had");
    const n = await api("notes", { method: "POST", body: { kind: "nota", title: "x" } });
    expect(n.budget).toBe("");
  });

  it("new settings have safe defaults", async () => {
    const { settings } = await api("bootstrap");
    expect(settings.masjid).toEqual({ on: false, minit: 20 });
    expect(settings.kunci).toEqual({ on: true, minit: 3 });
    expect(settings.ringkasanMingguan).toBe(true);
    expect(settings.bunyi.azanUri).toBe("");
  });
});
