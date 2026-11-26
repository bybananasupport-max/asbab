import { describe, it, expect } from "vitest";
import GH from "../www/github.js";
import { fakeGitHub } from "./fakegithub.js";

describe("github helpers", () => {
  it("cleans paths and repo names", () => {
    expect(GH.cleanPath("/src/app.js")).toBe("src/app.js");
    expect(GH.cleanPath("../etc/passwd")).toBeNull();
    expect(GH.cleanPath("a//b")).toBeNull();
    expect(GH.cleanRepo("https://github.com/bybanana/milo.git")).toBe("bybanana/milo");
    expect(GH.cleanRepo("bybanana/milo")).toBe("bybanana/milo");
    expect(GH.cleanRepo("not a repo")).toBeNull();
  });

  it("base64 round-trips Malay text and emoji", () => {
    const t = "Selamat datang ke kedai 🌙 — harga RM12.50";
    expect(GH.b64decode(GH.b64encode(t))).toBe(t);
  });

  it("reads, commits several files at once and reverts", async () => {
    const f = fakeGitHub({ "index.html": "<h1>Lama</h1>\n", "style.css": "body{}\n" });
    const git = GH.createGitHub(f.request);
    expect((await git.tree("u/r", "main")).map((x) => x.path).sort()).toEqual(["index.html", "style.css"]);
    expect((await git.read("u/r", "main", "index.html")).content).toBe("<h1>Lama</h1>\n");
    expect((await git.read("u/r", "main", "tiada.txt")).exists).toBe(false);
    await git.commit("u/r", "main", [{ path: "index.html", content: "<h1>Baru</h1>\n" }, { path: "new.js", content: "x\n" }], "Asbab: ubah");
    expect(f.repo.files["index.html"]).toBe("<h1>Baru</h1>\n");
    expect(f.repo.files["new.js"]).toBe("x\n");
    await git.commit("u/r", "main", [{ path: "new.js", delete: true }], "Asbab: patah balik");
    expect("new.js" in f.repo.files).toBe(false);
    expect(f.repo.commits).toEqual(["Asbab: ubah", "Asbab: patah balik"]);
  });
});
