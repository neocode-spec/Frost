// Frost search server (v2). Keeps your Gemini API key off the phone simulator.
// Set GEMINI_API_KEY in your host's environment settings. Never put the key in this file.
const http = require("http");

const PORT = process.env.PORT || 8787;
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const ORIGIN = process.env.FROST_ORIGIN || "*";

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const u = new URL(req.url, "http://localhost");

  if (u.pathname === "/health") {
    return send(res, 200, { ok: true, keySet: !!KEY, model: MODEL });
  }
  if (u.pathname !== "/search") return send(res, 404, { error: "Use /search?q=your+words" });

  const q = (u.searchParams.get("q") || "").trim().slice(0, 300);
  if (!q) return send(res, 400, { error: "missing q" });
  if (!KEY) return send(res, 500, { error: "GEMINI_API_KEY is not set on the server" });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text:
          `Search the web for: ${q}\n` +
          `Reply with ONLY a JSON array of up to 5 objects, each {"title": string, "text": short summary, "url": string}.`
        }] }],
        tools: [{ google_search: {} }]
      })
    });
    const data = await r.json();
    if (!r.ok) return send(res, 502, { error: data.error ? data.error.message : "Gemini request failed" });

    const parts = data.candidates && data.candidates[0] && data.candidates[0].content
      ? data.candidates[0].content.parts || []
      : [];
    const raw = parts.map(p => p.text || "").join("").replace(/```json|```/g, "").trim();

    let results;
    try {
      results = JSON.parse(raw);
    } catch (e) {
      results = [{ title: q, text: raw.slice(0, 500), url: "" }];
    }
    if (!Array.isArray(results)) results = [results];
    send(res, 200, { results: results.slice(0, 5) });
  } catch (err) {
    send(res, 502, { error: String((err && err.message) || err) });
  }
}).listen(PORT, () => console.log(`Frost search server on port ${PORT}`));
