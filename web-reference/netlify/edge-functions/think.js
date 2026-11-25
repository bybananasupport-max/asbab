// /api/think: otak kedua Asbab. Strim jawapan Claude terus ke skrin.
const ERR = "[[ASBAB_ERROR]]";

function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export default async (req) => {
  const expected = Netlify.env.get("ASBAB_PASSWORD") || "CHANGE_ME";
  if ((req.headers.get("x-asbab-key") || "") !== expected) return json({ error: "Password salah." }, 401);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ANTHROPIC_API_KEY belum diset dalam Netlify." }, 400);

  const body = await req.json().catch(() => ({}));
  const heavy = body.weight === "heavy";
  const model = heavy
    ? Netlify.env.get("ASBAB_MODEL_HEAVY") || "claude-sonnet-5-5"
    : Netlify.env.get("ASBAB_MODEL_LIGHT") || "claude-haiku-5-5";
  const maxTokens = Math.min(Math.max(parseInt(body.maxTokens) || (heavy ? 16000 : 1200), 128), 32000);

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: maxTokens, stream: true,
      system: [{ type: "text", text: String(body.system || ""), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: String(body.prompt || "") }],
    }),
  });
  if (!upstream.ok) {
    const t = await upstream.text();
    let msg = t;
    try { msg = JSON.parse(t).error?.message || t; } catch { /* kekal */ }
    return json({ error: `Claude (${upstream.status}): ${String(msg).slice(0, 400)}` }, 502);
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const reader = upstream.body.getReader();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            let ev;
            try { ev = JSON.parse(line.slice(5)); } catch { continue; }
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") ctrl.enqueue(enc.encode(ev.delta.text));
            if (ev.type === "error") ctrl.enqueue(enc.encode(`\n${ERR}${ev.error?.message || "ralat"}`));
          }
        }
      } catch (e) {
        ctrl.enqueue(enc.encode(`\n${ERR}${e.message}`));
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-model": model } });
};

export const config = { path: "/api/think" };
