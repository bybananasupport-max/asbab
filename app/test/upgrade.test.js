import { describe, it, expect } from "vitest";
import U from "../www/upgrade.js";

describe("risk rules (Phase 7.2)", () => {
  it("files decide the risk: looks = low, logic = medium, security/data/permissions/alarms/workflows = high", () => {
    expect(U.riskOfFiles(["app/www/ui62.css", "app/www/icons.js"])).toBe("rendah");
    expect(U.riskOfFiles(["app/www/ui62.css", "app/www/views.js"])).toBe("sederhana");
    for (const f of ["app/android/app/src/main/java/com/bybanana/asbab/SecretStore.kt", "app/www/backup.js", "app/android/app/src/main/AndroidManifest.xml",
      "app/android/app/src/main/java/com/bybanana/asbab/Scheduler.kt", ".github/workflows/android.yml", "app/www/store.js", "app/android/app/src/main/java/com/bybanana/asbab/AppLock.kt"])
      expect(U.riskOfFiles([f]), f).toBe("tinggi");
  });
  it("text never lowers the AI's own guess", () => {
    expect(U.riskOfText("tukar warna butang hantar", "rendah")).toBe("rendah");
    expect(U.riskOfText("tukar warna butang hantar", "sederhana")).toBe("sederhana");
    expect(U.riskOfText("tambah ciri ringkasan mingguan", "rendah")).toBe("sederhana");
    expect(U.riskOfText("ubah cara simpan token GitHub", "rendah")).toBe("tinggi");
    expect(U.riskOfText("ubah Mod Bilal")).toBe("tinggi");
  });
});

describe("forbidden files and branches (Phase 7.2)", () => {
  it("Asbab may not touch its rules, the approval rules or the keystore workflow", () => {
    expect(U.checkFiles(["CLAUDE.md", "app/www/app.js"]).blocked).toEqual(["CLAUDE.md"]);
    for (const f of ["AGENTS.md", "GEMINI.md", "app/www/upgrade.js", "app/test/upgrade.test.js", ".github/workflows/keystore.yml", "/CLAUDE.md"])
      expect(U.checkFiles([f]).ok, f).toBe(false);
    expect(U.checkFiles(["app/www/views.js", "README.md"]).ok).toBe(true);
  });
  it("work always happens in its own branch, never main", () => {
    expect(U.branchName("abc 12!")).toBe("asbab/minta-abc12");
    expect(U.safeBranch("asbab/minta-x")).toBe(true);
    expect(U.safeBranch("main")).toBe(false);
    expect(U.safeBranch("asbab/../main")).toBe(false);
  });
});

describe("approval (Phase 7.2)", () => {
  const base = { stage: "ujian", checklist: [{ text: "a", done: false }] };
  it("low risk: one approval once the test version exists", () => {
    expect(U.canApprove({ ...base, risk: "rendah" }).ok).toBe(true);
    expect(U.canApprove({ ...base, risk: "rendah", stage: "dibina" }).ok).toBe(false);
  });
  it("medium risk: the test APK must be tried", () => {
    expect(U.canApprove({ ...base, risk: "sederhana" }).ok).toBe(false);
    expect(U.canApprove({ ...base, risk: "sederhana", tested: true }).ok).toBe(true);
  });
  it("high risk: tried and every checklist item ticked", () => {
    expect(U.canApprove({ ...base, risk: "tinggi", tested: true }).ok).toBe(false);
    expect(U.canApprove({ ...base, risk: "tinggi", tested: true, checklist: [{ text: "a", done: true }] }).ok).toBe(true);
  });
  it("high risk always gets the safety checks", () => {
    const list = U.withRiskChecks(["Uji butang"], "tinggi").map((x) => x.text);
    expect(list).toEqual(["Uji butang", ...U.HIGH_CHECKS]);
    expect(U.withRiskChecks(["Uji butang"], "rendah")).toHaveLength(1);
  });
});

describe("queue and spec (Phase 7.2)", () => {
  it("one request works at a time, the oldest waiting one goes next", () => {
    expect(U.nextInQueue([{ id: 1, stage: "bekerja" }, { id: 2, stage: "giliran", queuedAt: 1 }])).toBeNull();
    expect(U.nextInQueue([{ id: 2, stage: "giliran", queuedAt: 5 }, { id: 3, stage: "giliran", queuedAt: 2 }, { id: 4, stage: "ujian" }]).id).toBe(3);
  });
  it("reads the AI's spec and keeps the stricter risk", () => {
    const r = U.parseSpec('Butang kongsi dalam Catatan.\n<<SPEK>>{"tajuk":"Butang kongsi","ringkas":"Tambah butang kongsi","senarai":["Tekan kongsi"],"risiko":"rendah","baharu":"Kini boleh kongsi catatan"}', "tambah butang kongsi dan padam data lama");
    expect(r).toMatchObject({ title: "Butang kongsi", risk: "tinggi", whatsNew: "Kini boleh kongsi catatan", spec: "Butang kongsi dalam Catatan." });
    expect(r.checklist.map((c) => c.text)).toContain("Semakan kedua dah dibuat");
  });
  it("issue text keeps the rules and the branch", () => {
    const t = U.issueBody({ id: "x1", title: "A", text: "Buat A", risk: "sederhana", checklist: [{ text: "uji" }] }, "@gemini-cli");
    expect(t.startsWith("@gemini-cli")).toBe(true);
    expect(t).toContain("asbab/minta-x1");
    expect(t).toContain("Jangan commit terus ke main");
  });
});
