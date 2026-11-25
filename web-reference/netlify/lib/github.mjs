// Baca dan commit fail ke repo GitHub project kod.
async function gh(path, init = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "asbab",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(data?.message || `GitHub ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return data;
}
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|\.netlify|vendor)\//;

export function cleanPath(p) {
  const path = String(p || "").trim().replace(/^\/+/, "");
  if (!path || path.split("/").some((s) => s === ".." || s === "")) return null;
  return path;
}

export async function tree(repo, branch) {
  const t = await gh(`/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  return t.tree.filter((n) => n.type === "blob" && !SKIP.test(n.path)).map((n) => ({ path: n.path, size: n.size }));
}

export async function read(repo, branch, path) {
  try {
    const f = await gh(`/repos/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`);
    if (Array.isArray(f) || !f.content) return { exists: true, content: "", tooBig: true };
    return { exists: true, content: Buffer.from(f.content, "base64").toString("utf8") };
  } catch (e) {
    if (e.status === 404) return { exists: false, content: "" };
    throw e;
  }
}

// files: [{ path, content }] atau [{ path, delete: true }]
export async function commit(repo, branch, files, message) {
  const ref = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const parentSha = ref.object.sha;
  const parent = await gh(`/repos/${repo}/git/commits/${parentSha}`);
  const entries = files.map((f) =>
    f.delete
      ? { path: f.path, mode: "100644", type: "blob", sha: null }
      : { path: f.path, mode: "100644", type: "blob", content: f.content });
  const t = await gh(`/repos/${repo}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }) });
  const c = await gh(`/repos/${repo}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: t.sha, parents: [parentSha] }) });
  await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
  return { sha: c.sha, url: `https://github.com/${repo}/commit/${c.sha}` };
}
