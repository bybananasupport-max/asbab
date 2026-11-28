// Tiny in-memory imitation of the GitHub REST endpoints Asbab uses (for unit tests).
import GH from "../www/github.js";

export function fakeGitHub(files = {}) {
  const repo = { files: { ...files }, commits: [], head: "c0", refs: {}, pulls: [], issues: [], comments: [], runs: [], releases: [], dispatches: [], merged: [] };
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
    if (method === "GET" && (m = path.match(/\/git\/ref\/heads\/(.+)$/))) {
      const b = decodeURIComponent(m[1]);
      return { status: 200, data: { object: { sha: repo.refs[b] || repo.head } } };
    }
    // Phase 7.2: branches, pull requests, issues, builds, releases.
    if (method === "POST" && /\/git\/refs$/.test(path)) {
      const b = body.ref.replace("refs/heads/", "");
      if (repo.refs[b]) return { status: 422, data: { message: "Reference already exists" }, message: "exists" };
      repo.refs[b] = body.sha;
      return { status: 201, data: {} };
    }
    if (method === "POST" && /\/pulls$/.test(path)) {
      const pr = { number: repo.pulls.length + 1, html_url: `https://github.com/x/pull/${repo.pulls.length + 1}`, head: body.head, base: body.base, title: body.title, body: body.body, state: "open" };
      repo.pulls.push(pr);
      return { status: 201, data: pr };
    }
    if (method === "GET" && (m = path.match(/\/pulls\?state=all&head=(.+)$/))) {
      const head = decodeURIComponent(m[1]).split(":")[1];
      return { status: 200, data: repo.pulls.filter((x) => x.head === head) };
    }
    if (method === "PUT" && (m = path.match(/\/pulls\/(\d+)\/merge$/))) { repo.merged.push(Number(m[1])); return { status: 200, data: { merged: true } }; }
    if (method === "PATCH" && (m = path.match(/\/pulls\/(\d+)$/))) { repo.pulls[Number(m[1]) - 1].state = body.state; return { status: 200, data: {} }; }
    if (method === "POST" && /\/issues$/.test(path)) { const i = { number: 100 + repo.issues.length, html_url: "https://github.com/x/issues/1", ...body }; repo.issues.push(i); return { status: 201, data: i }; }
    if (method === "POST" && (m = path.match(/\/issues\/(\d+)\/comments$/))) { repo.comments.push({ n: Number(m[1]), body: body.body }); return { status: 201, data: {} }; }
    if (method === "GET" && /\/actions\/runs/.test(path)) return { status: 200, data: { workflow_runs: repo.runs } };
    if (method === "GET" && /\/releases\?/.test(path)) return { status: 200, data: repo.releases };
    if (method === "POST" && /\/dispatches$/.test(path)) { repo.dispatches.push(body); return { status: 204, data: null }; }
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
    if (method === "PATCH" && (m = path.match(/\/git\/refs\/heads\/(.+)$/)) && repo.refs[decodeURIComponent(m[1])]) {
      repo.refs[decodeURIComponent(m[1])] = body.sha; repo.commits.push(commits[body.sha].message);
      repo.branchFiles = { ...(repo.branchFiles || {}), [decodeURIComponent(m[1])]: { ...trees[commits[body.sha].tree] } };
      return { status: 200, data: {} };
    }
    if (method === "PATCH" && /\/git\/refs\/heads\//.test(path)) {
      repo.head = body.sha; repo.files = { ...trees[commits[body.sha].tree] }; repo.commits.push(commits[body.sha].message);
      return { status: 200, data: {} };
    }
    return { status: 404, data: null, message: "unexpected " + method + " " + path };
  };
  return { repo, request };
}
