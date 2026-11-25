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

  return { findAmounts, firstAmount, rm };
});
