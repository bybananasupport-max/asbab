import { describe, it, expect } from "vitest";
import T from "../www/tools.js";

describe("read-only tool filter (Phase 7.3)", () => {
  it("only reading tools are allowed", () => {
    for (const name of Object.keys(T.TOOLS)) expect(T.allowed(name)).toBe(true);
    for (const name of ["padam_catatan", "ubah_tetapan", "commit_kod", "hantar_mesej", "__proto__", "constructor", "toString"]) expect(T.allowed(name)).toBe(false);
  });
  it("reads one tool call and marks forbidden ones", () => {
    const r = T.parseToolCall('Sekejap.\n<<ALAT>>{"alat":"semak_website","args":{"nama":"Milo","x":{"y":1}}}');
    expect(r.call).toEqual({ alat: "semak_website", args: { nama: "Milo" }, ok: true });
    expect(r.text).toBe("Sekejap.");
    expect(T.parseToolCall('<<ALAT>>{"alat":"padam_catatan","args":{}}').call.ok).toBe(false);
    expect(T.parseToolCall("tiada alat").call).toBeNull();
    expect(T.parseToolCall("<<ALAT>>{rosak").call).toBeNull();
    expect(T.stepLabel({ alat: "semak_website", args: { nama: "Milogamingstore" } })).toBe("🔍 Menyemak website Milogamingstore…");
  });
});

describe("charts and hand-off (Phase 7.3)", () => {
  it("keeps only well-formed charts", () => {
    const r = T.parseChart('Ini graf.\n<<GRAF>>{"jenis":"bar","tajuk":"Belanja","label":["Isn","Sel"],"nilai":[5,7.5],"unit":"RM"}\n<<GRAF>>{"label":["a"],"nilai":["x"]}');
    expect(r.charts).toEqual([{ jenis: "bar", tajuk: "Belanja", label: ["Isn", "Sel"], nilai: [5, 7.5], unit: "RM" }]);
    expect(r.text).toBe("Ini graf.");
  });
  it("hand-off only to a project that exists", () => {
    const ps = [{ id: "p1", name: "Milogamingstore" }];
    expect(T.parseHandoff('Boleh.\n<<HANTAR>>{"project":"milogaming","ringkasan":"Tambah butang"}', ps).handoff).toEqual({ projectId: "p1", name: "Milogamingstore", ringkasan: "Tambah butang" });
    expect(T.parseHandoff('<<HANTAR>>{"project":"Tiada","ringkasan":"x"}', ps).handoff).toBeNull();
  });
});

describe("categories and global search (Phase 7.3)", () => {
  it("spending categories without AI", () => {
    expect(T.categoryOf("Nasi lemak")).toBe("Makanan");
    expect(T.categoryOf("Teh tarik")).toBe("Minuman");
    expect(T.categoryOf("Minyak motor")).toBe("Pengangkutan");
    expect(T.categoryOf("Bil unifi")).toBe("Bil");
    expect(T.categoryOf("Hadiah")).toBe("Belanja lain");
  });
  it("searches everything at once, grouped by type", () => {
    const data = {
      messages: [{ roomId: "utama", roomName: "Asbab", text: "Jumpa client Milo esok", ts: 1 }],
      notes: [{ id: "n1", kind: "belanja", title: "Nasi lemak", amount: 6, date: "2026-11-28" }, { id: "n2", kind: "jadual", title: "Kelas English", date: "2026-11-29", time: "10:00" }, { id: "n3", kind: "idea", title: "App masjid", date: "2026-11-20" }],
      projects: [{ id: "p1", name: "Milogamingstore", type: "website", url: "https://milo.com" }],
      kerja: [{ project: { id: "b1", name: "Diploma" }, subjek: [{ id: "s1", name: "English Skills" }], tugasan: [{ title: "Essay", subjectId: "s1", due: "2026-12-01T17:00" }], nota: [] }],
      settings: [["tema", "Wallpaper dan rupa", "tema warna"]],
    };
    const ids = (q) => T.searchAll(q, data).map((g) => g.id);
    expect(ids("milo")).toEqual(["chat", "project"]);
    expect(ids("english")).toEqual(["jadual", "assignment"]);
    expect(ids("makanan")).toEqual(["belanja"]);
    expect(ids("warna")).toEqual(["tetapan"]);
    expect(T.searchAll("x", data)).toEqual([]);
    expect(T.searchAll("english", data).find((g) => g.id === "assignment").items[0].hash).toBe("#/project/b1/subjek/s1");
  });
});
