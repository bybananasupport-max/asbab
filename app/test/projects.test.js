import { describe, it, expect } from "vitest";
import P from "../www/projects.js";

describe("project types and blocks (Phase 7.1)", () => {
  it("unknown types become Biasa; each type has its default blocks", () => {
    expect(P.typeOf("xyz")).toBe("biasa");
    expect(P.defaultBlocks("kod")).toEqual(["permintaan", "binaan", "aktiviti"]);
    expect(P.defaultBlocks("website")).toEqual(["status", "graf", "aktiviti"]);
    expect(P.defaultBlocks("belajar")[0]).toBe("minda");
  });

  it("only known blocks are kept, without repeats", () => {
    expect(P.cleanBlocks(["nota", "skrin-baru", "NOTA", "kuiz"], "biasa")).toEqual(["nota", "kuiz"]);
    expect(P.cleanBlocks("rosak", "kod")).toEqual(P.defaultBlocks("kod"));
  });

  it("reads a layout change from the AI's answer", () => {
    const r = P.parseBlocks('Baik, nota di atas.\n<<BLOK>>["nota","tugasan"]');
    expect(r.blocks).toEqual(["nota", "tugasan"]);
    expect(r.reply).toBe("Baik, nota di atas.");
    expect(P.parseBlocks("tiada perubahan").blocks).toBeNull();
  });
});

describe("Belajar helpers (Phase 7.1)", () => {
  const now = new Date("2026-11-28T10:00:00").getTime();
  it("urgency colours: yellow when near, red on the last day", () => {
    expect(P.dueLevel("2026-12-10T23:59", now)).toBe("biasa");
    expect(P.dueLevel("2026-11-30T23:59", now)).toBe("kuning");
    expect(P.dueLevel("2026-11-29T08:00", now)).toBe("merah");
    expect(P.dueLevel("2026-11-27T08:00", now)).toBe("lepas");
    expect(P.dueLevel("2026-11-27T08:00", now, true)).toBe("siap");
  });
  it("countdown in days and hours when far, hours and minutes when near", () => {
    expect(P.dueText("2026-12-03T13:00", now)).toBe("5 hari 3 jam");
    expect(P.dueText("2026-11-28T17:20", now)).toBe("7 jam 20 minit");
    expect(P.dueText("2026-11-27T00:00", now)).toBe("Lepas tarikh");
  });
  it("progress ring", () => {
    expect(P.progress([{ done: true }, { done: false }])).toBe(0.5);
    expect(P.progress([])).toBe(0);
  });
  it("reads the AI's summary of an assignment and matches the subject", () => {
    const subjects = [{ id: "s1", name: "English Skills" }, { id: "s2", name: "Programming" }];
    const r = P.parseIntake('Ini essay.\n<<TUGASAN>>{"tajuk":"Essay","jenis":"Essay","tarikh":"2026-12-05","masa":"","rubrik":"500 patah","subjek":"english"}', subjects);
    expect(r.reply).toBe("Ini essay.");
    expect(r.intake).toMatchObject({ title: "Essay", due: "2026-12-05T23:59", subjectId: "s1", rubrik: "500 patah" });
    expect(P.parseIntake("tiada", subjects).intake).toBeNull();
  });
  it("keeps only well-formed quiz questions", () => {
    const r = P.parseQuiz('Kuiz!\n<<KUIZ>>[{"s":"1+1?","p":["1","2"],"j":1},{"s":"rosak","p":["a"],"j":0},{"s":"x","p":["a","b"],"j":5}]');
    expect(r.questions).toEqual([{ s: "1+1?", p: ["1", "2"], j: 1 }]);
  });
});
