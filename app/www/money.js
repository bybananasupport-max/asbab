// Ringgit amount detection without AI: "RM12.50", "rm 5", "RM1,250.00", "MYR 3.20".
// Used by the own brain (chat) and, from Phase 3, by bank/e-wallet notifications.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Money = api;
})(typeof self !== "undefined" ? self : this, function () {
  // Currency marker, optional space, then either 1,234,567 or plain digits, then optional .cents.
  const RE = /(?:^|[^a-z0-9])(?:rm|myr)\s?((?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.(\d{1,2}))?(?![\d.,]*\d)/gi;

  // All ringgit amounts found in the text, in order. Returns numbers rounded to sen.
  function findAmounts(text) {
    const out = [];
    const s = String(text || "");
    RE.lastIndex = 0;
    let m;
    while ((m = RE.exec(s))) {
      const whole = m[1].replace(/,/g, "");
      const cents = (m[2] || "").padEnd(2, "0");
      const n = Number(`${whole}.${cents || "00"}`);
      if (Number.isFinite(n)) out.push(Math.round(n * 100) / 100);
    }
    return out;
  }

  // First amount in the text, or null.
  function firstAmount(text) {
    const all = findAmounts(text);
    return all.length ? all[0] : null;
  }

  const rm = (n) => `RM${Number(n || 0).toFixed(2)}`;

  /* ---------- Receipts (Phase 6.2): text read from a photo on the phone, no AI ---------- */
  // Amounts on a receipt line: "12.50", "RM 12.50", "1,250.00" (receipts often leave out "RM").
  const LINE_AMOUNT = /(?:rm|myr)?\s?(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})(?!\d)/gi;
  function lineAmounts(line) {
    const out = [];
    for (const m of String(line).matchAll(LINE_AMOUNT)) out.push(Math.round(Number(m[1].replace(/,/g, "") + "." + m[2]) * 100) / 100);
    return out;
  }
  // The total on a receipt: the "grand total / jumlah / total / amount due" line (not subtotal, tax or change),
  // otherwise the biggest amount. Returns null when nothing looks like money.
  function receiptTotal(text) {
    const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const skip = /sub\s?-?total|subjumlah|tax|cukai|sst|gst|service|caj|change|baki|tunai|cash|tendered|rounding|pembundaran|discount|diskaun|saving/i;
    const words = [/grand\s*total/i, /jumlah\s*(besar|keseluruhan|bayaran)?/i, /amount\s*due|total\s*due|net\s*total|nett|total\s*amount|total/i];
    for (const w of words) {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!w.test(lines[i]) || skip.test(lines[i])) continue;
        const here = lineAmounts(lines[i]);
        if (here.length) return here[here.length - 1];
        const next = lines[i + 1] ? lineAmounts(lines[i + 1]) : [];
        if (next.length) return next[0];
      }
    }
    const all = lines.filter((l) => !skip.test(l)).flatMap(lineAmounts).filter((n) => n > 0 && n < 100000);
    return all.length ? Math.max(...all) : null;
  }
  // A short name for the receipt: the first line with letters (usually the shop name).
  function receiptShop(text) {
    const line = String(text || "").split(/\r?\n/).map((l) => l.trim()).find((l) => /[a-z]{3,}/i.test(l) && !/receipt|resit|invoice|tax|cukai/i.test(l));
    return line ? line.slice(0, 40) : "";
  }

  return { findAmounts, firstAmount, rm, receiptTotal, receiptShop };
});
