import { describe, it, expect } from "vitest";
import Core from "../www/core.js";

describe("versions", () => {
  it("parses tags and dev versions", () => {
    expect(Core.parseVersion("v0.1.12")).toEqual([0, 1, 12]);
    expect(Core.parseVersion("0.1.0-dev")).toEqual([0, 1, 0]);
    expect(Core.parseVersion("2")).toEqual([2, 0, 0]);
    expect(Core.parseVersion("abc")).toBeNull();
  });

  it("compares numerically, not as text", () => {
    expect(Core.compareVersions("0.1.10", "0.1.9")).toBe(1);
    expect(Core.compareVersions("v0.1.9", "0.1.10")).toBe(-1);
    expect(Core.compareVersions("0.2.0", "v0.2.0")).toBe(0);
    expect(Core.compareVersions("rubbish", "0.0.1")).toBe(-1);
  });
});

describe("updateInfo", () => {
  const release = {
    tag_name: "v0.1.15",
    html_url: "https://github.com/bybananasupport-max/asbab/releases/tag/v0.1.15",
    body: "Fasa 1",
    assets: [
      { name: "notes.txt", browser_download_url: "https://example.invalid/notes.txt" },
      { name: "asbab-0.1.15.apk", browser_download_url: "https://example.invalid/asbab-0.1.15.apk" },
    ],
  };

  it("offers a newer release and picks the APK asset", () => {
    const u = Core.updateInfo("0.1.12", release);
    expect(u.available).toBe(true);
    expect(u.latest).toBe("0.1.15");
    expect(u.apkName).toBe("asbab-0.1.15.apk");
    expect(u.apkUrl).toMatch(/\.apk$/);
  });

  it("does not offer the same or an older release", () => {
    expect(Core.updateInfo("0.1.15", release).available).toBe(false);
    expect(Core.updateInfo("0.2.0", release).available).toBe(false);
  });

  it("treats a local dev build as older than any release", () => {
    expect(Core.updateInfo("0.1.0-dev", release).available).toBe(true);
  });

  it("handles a missing release", () => {
    expect(Core.updateInfo("0.1.0", null)).toEqual({ available: false, reason: "no-release" });
  });
});

describe("time helpers", () => {
  it("uses Malaysia time", () => {
    // 2026-11-24 17:30 UTC is 2026-11-25 01:30 in Malaysia (UTC+8).
    const n = Core.nowMY(new Date("2026-11-24T17:30:00Z"));
    expect(n.date).toBe("2026-11-25");
    expect(n.hh).toBe(1);
    expect(n.mm).toBe(30);
    expect(n.hari).toBe("Rabu");
  });

  it("adds days across month ends", () => {
    expect(Core.addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(Core.addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("converts HH:MM to minutes", () => {
    expect(Core.toMin("13:05")).toBe(785);
    expect(Core.toMin("")).toBe(0);
  });
});

describe("personality (Phase 7.0)", () => {
  it("default personality has the thinking paragraph once", () => {
    expect(Core.PERSONALITY.split(Core.THINKING_TITLE).length - 1).toBe(1);
  });
  it("adds the paragraph to Amin's own text without replacing it, and only once", () => {
    const mine = "Nama kau Asbab. Cakap pendek-pendek.";
    const out = Core.withThinking(mine);
    expect(out.startsWith(mine)).toBe(true);
    expect(out).toContain(Core.THINKING_TITLE);
    expect(Core.withThinking(out)).toBe(out);
  });
});
