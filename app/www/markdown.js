// Small, safe Markdown for Asbab's answers (Phase 6.2): bold, italic, code, headings, lists, links.
// Everything is HTML-escaped first, so text from AI or other apps can never add its own HTML.
// Links become <a data-url="..."> (opened outside Asbab by the chat screen); only http(s) links are kept.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Markdown = api;
})(typeof self !== "undefined" ? self : this, function () {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // Inline formatting on one escaped line. Code spans are cut out first so nothing inside them is formatted.
  function inline(text) {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    const links = [];
    const keep = (url, label) => { links.push(`<a href="#" data-url="${url}">${label}</a>`); return `\u0001${links.length - 1}\u0001`; };
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => keep(url, label));
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,!?;:])/g, (_, pre, url) => pre + keep(url, url));
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>").replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => links[i]);
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  function toHtml(text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let list = null; // "ul" | "ol"
    let para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; } };
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        flushPara(); closeList();
        const body = [];
        while (++i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i]);
        out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
        continue;
      }
      const head = line.match(/^\s*#{1,6}\s+(.*)$/);
      const ul = line.match(/^\s*[-*•]\s+(.*)$/);
      const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (head) { flushPara(); closeList(); out.push(`<p class="md-tajuk"><strong>${inline(head[1])}</strong></p>`); }
      else if (ul || ol) {
        flushPara();
        const kind = ul ? "ul" : "ol";
        if (list !== kind) { closeList(); out.push(kind === "ol" && ol[1] !== "1" ? `<ol start="${Number(ol[1])}">` : `<${kind}>`); list = kind; }
        out.push(`<li>${inline(ul ? ul[1] : ol[2])}</li>`);
      } else if (!line.trim()) { flushPara(); closeList(); }
      else { closeList(); para.push(line); }
    }
    flushPara(); closeList();
    return out.join("");
  }

  // Plain text without Markdown symbols (for copying and sharing).
  function toPlain(text) {
    return String(text || "")
      .replace(/```[a-z]*\n?/gi, "")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1")
      .replace(/^\s*#{1,6}\s+/gm, "").replace(/`([^`]+)`/g, "$1");
  }

  return { toHtml, toPlain, esc };
});
