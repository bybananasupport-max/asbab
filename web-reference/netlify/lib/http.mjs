export const PASSWORD_FALLBACK = "CHANGE_ME";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function authed(req) {
  const expected = process.env.ASBAB_PASSWORD || PASSWORD_FALLBACK;
  const got = req.headers.get("x-asbab-key") || "";
  if (got.length !== expected.length) return false;
  let r = 0;
  for (let i = 0; i < got.length; i++) r |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return r === 0;
}
