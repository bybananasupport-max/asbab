// Read and commit files in a code project's GitHub repo (ported from web-reference/netlify/lib/github.mjs).
// All calls go through `request(method, path, body)` -> { status, data, message }, which on the phone is
// the native plugin: the GitHub token stays in Kotlin and never enters the web UI.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GitHubApi = api;
})(typeof self !== "undefined" ? self : this, function () {
  const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|\.netlify|vendor)\//;
  const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

  // "a/b.js" ok; "../x", "/x/", "a//b" rejected.
  function cleanPath(p) {
    const path = String(p || "").trim().replace(/^\/+/, "");
    if (!path || path.split("/").some((s) => s === ".." || s === "" || s === ".")) return null;
    return path;
  }
  function cleanRepo(r) {
    const m = String(r || "").trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
    return m ? `${m[1]}/${m[2]}` : null;
  }

  // UTF-8 safe base64 (GitHub sends and expects base64 file contents).
  function b64encode(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64 || "").replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function createGitHub(request) {
    async function gh(method, path, body) {
      const r = await request(method, path, body);
      if (r.status < 200 || r.status > 299) {
        const e = new Error(r.message || `GitHub ${r.status}`);
        e.status = r.status;
        throw e;
      }
      return r.data;
    }

    async function tree(repo, branch) {
      const t = await gh("GET", `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
      return t.tree.filter((n) => n.type === "blob" && !SKIP.test(n.path)).map((n) => ({ path: n.path, size: n.size }));
    }

    async function read(repo, branch, path) {
      try {
        const f = await gh("GET", `/repos/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`);
        if (Array.isArray(f) || !f.content) return { exists: true, content: "", tooBig: true };
        return { exists: true, content: b64decode(f.content), sha: f.sha };
      } catch (e) {
        if (e.status === 404) return { exists: false, content: "" };
        throw e;
      }
    }

    // files: [{ path, content }] or [{ path, delete: true }] -> one commit on top of the branch.
    async function commit(repo, branch, files, message) {
      const ref = await gh("GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      const parentSha = ref.object.sha;
      const parent = await gh("GET", `/repos/${repo}/git/commits/${parentSha}`);
      const entries = files.map((f) => (f.delete
        ? { path: f.path, mode: "100644", type: "blob", sha: null }
        : { path: f.path, mode: "100644", type: "blob", content: f.content }));
      const t = await gh("POST", `/repos/${repo}/git/trees`, { base_tree: parent.tree.sha, tree: entries });
      const c = await gh("POST", `/repos/${repo}/git/commits`, { message, tree: t.sha, parents: [parentSha] });
      await gh("PATCH", `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: c.sha });
      return { sha: c.sha, url: `https://github.com/${repo}/commit/${c.sha}` };
    }

    /* ---------- Phase 7.2: branches, pull requests, builds, releases ---------- */
    // New branch from the tip of another one (does nothing if it already exists).
    async function branch(repo, from, name) {
      const ref = await gh("GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(from)}`);
      try { await gh("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${name}`, sha: ref.object.sha }); }
      catch (e) { if (e.status !== 422) throw e; }
      return name;
    }
    const openPull = (repo, head, base, title, body) => gh("POST", `/repos/${repo}/pulls`, { head, base, title, body });
    async function pullFor(repo, head) {
      const owner = repo.split("/")[0];
      const list = await gh("GET", `/repos/${repo}/pulls?state=all&head=${encodeURIComponent(`${owner}:${head}`)}`);
      return list[0] || null;
    }
    const pull = (repo, n) => gh("GET", `/repos/${repo}/pulls/${n}`);
    const merge = (repo, n, title) => gh("PUT", `/repos/${repo}/pulls/${n}/merge`, { merge_method: "squash", commit_title: title });
    const closePull = (repo, n) => gh("PATCH", `/repos/${repo}/pulls/${n}`, { state: "closed" });
    const comment = (repo, n, body) => gh("POST", `/repos/${repo}/issues/${n}/comments`, { body });
    const issue = (repo, title, body, labels) => gh("POST", `/repos/${repo}/issues`, { title, body, ...(labels ? { labels } : {}) });
    const runs = async (repo, q = "") => (await gh("GET", `/repos/${repo}/actions/runs?per_page=10${q}`)).workflow_runs || [];
    const releases = (repo) => gh("GET", `/repos/${repo}/releases?per_page=15`);
    const dispatch = (repo, workflow, ref, inputs) => gh("POST", `/repos/${repo}/actions/workflows/${workflow}/dispatches`, { ref, inputs });

    return { tree, read, commit, branch, openPull, pullFor, pull, merge, closePull, comment, issue, runs, releases, dispatch, request: gh };
  }

  return { createGitHub, cleanPath, cleanRepo, b64encode, b64decode };
});
