// Tiny in-memory imitation of the GitHub REST endpoints Asbab uses (for unit tests).
import GH from "../www/github.js";

export function fakeGitHub(files = {}) {
  const repo = { files: { ...files }, commits: [], head: "c0" };
  const trees = { t0: { ...files } };
  const commits = { c0: { tree: "t0" } };
  let n = 0;
  const request = async (method, path, body) => {
    let m;
    if (method === "GET" && (m = path.match(/^\/repos\/([^/]+\/[^/]+)\/git\/trees\/[^?]+\?recursive=1$/)))
      return { status: 200, data: { tree: Object.keys(repo.files).map((p) => ({ path: p, type: "blob", size: repo.files[p].length })) } };
    if (method === "GET" && (m = path.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)\?ref=/))) {
      const p = decodeURIComponent(m[1]);
      if (!(p in repo.files)) return { status: 404, data: { message: "Not Found" }, message: "Repo atau fail tak dijumpai." };
      return { status: 200, data: { content: GH.b64encode(repo.files[p]), sha: "s" + p.length } };
    }
    if (method === "GET" && /\/git\/ref\/heads\//.test(path)) return { status: 200, data: { object: { sha: repo.head } } };
    if (method === "GET" && (m = path.match(/\/git\/commits\/(\w+)$/))) return { status: 200, data: { tree: { sha: commits[m[1]].tree } } };
    if (method === "POST" && /\/git\/trees$/.test(path)) {
      const t = { ...trees[body.base_tree] };
      for (const e of body.tree) { if (e.sha === null) delete t[e.path]; else t[e.path] = e.content; }
      const id = `t${++n}`; trees[id] = t;
      return { status: 201, data: { sha: id } };
    }
    if (method === "POST" && /\/git\/commits$/.test(path)) {
      const id = `c${++n}`; commits[id] = { tree: body.tree, message: body.message, parents: body.parents };
      return { status: 201, data: { sha: id } };
    }
    if (method === "PATCH" && /\/git\/refs\/heads\//.test(path)) {
      repo.head = body.sha; repo.files = { ...trees[commits[body.sha].tree] }; repo.commits.push(commits[body.sha].message);
      return { status: 200, data: {} };
    }
    return { status: 404, data: null, message: "unexpected " + method + " " + path };
  };
  return { repo, request };
}
