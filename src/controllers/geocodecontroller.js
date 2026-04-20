// Node 18+ has global fetch; no node-fetch import needed.
const MEMO = new Map();
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function geocode(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ message: "Missing q" });

    const now = Date.now();
    const cached = MEMO.get(q);
    if (cached && now - cached.t < TTL_MS) return res.json(cached.data);

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const ua = process.env.GEOCODER_USER_AGENT || "EnvoyTracker/1.0 (support@yourdomain.com)";

    const r = await fetch(url, { headers: { "User-Agent": ua, "Accept-Language": "en" } });
    if (!r.ok) return res.status(502).json({ message: `Upstream ${r.status}` });

    const arr = await r.json();
    const best = Array.isArray(arr) && arr[0] ? arr[0] : null;
    const out = best ? { lat: Number(best.lat), lon: Number(best.lon) } : { lat: null, lon: null };

    MEMO.set(q, { t: now, data: out });
    res.json(out);
  } catch (e) {
    console.error("geocode error:", e);
    res.status(500).json({ message: "Geocode failed" });
  }
}
