// src/controllers/geocodecontroller.js
//
// GET /api/geocode?q=<address>
//
// Strategy:
//   1. Normalised in-memory cache (case-insensitive, trims whitespace).
//   2. Nominatim (OpenStreetMap) lookup if not cached.
//   3. Returns { lat, lon, display } or { lat: null, lon: null } on no-hit.
//
// The frontend wraps this with its own localStorage cache, so most clients
// will never hit this endpoint after the first lookup of a given city.
//
// Node 18+ has global fetch; no node-fetch import needed.

const MEMO = new Map();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function normKey(s = "") {
  return String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

export async function geocode(req, res) {
  try {
    const qRaw = String(req.query.q || "").trim();
    if (!qRaw) return res.status(400).json({ message: "Missing q" });

    const q = normKey(qRaw);
    const now = Date.now();
    const cached = MEMO.get(q);
    if (cached && now - cached.t < TTL_MS) {
      return res.json(cached.data);
    }

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(qRaw)}`;
    const ua = process.env.GEOCODER_USER_AGENT || "EnvoyTracker/1.0 (envoymailservices@gmail.com)";

    let r;
    try {
      r = await fetch(url, {
        headers: { "User-Agent": ua, "Accept-Language": "en" },
      });
    } catch (netErr) {
      console.error("geocode network error:", netErr?.message || netErr);
      // Cache a null result for a short period so we don't hammer on outages
      const out = { lat: null, lon: null, display: null };
      MEMO.set(q, { t: now, data: out, ttl: 5 * 60 * 1000 });
      return res.json(out);
    }

    if (!r.ok) {
      // Nominatim 403/429 etc.
      const out = { lat: null, lon: null, display: null };
      MEMO.set(q, { t: now, data: out, ttl: 5 * 60 * 1000 });
      return res.json(out);
    }

    const arr = await r.json();
    const best = Array.isArray(arr) && arr[0] ? arr[0] : null;
    const out = best
      ? {
          lat: Number(best.lat),
          lon: Number(best.lon),
          display: best.display_name || qRaw,
        }
      : { lat: null, lon: null, display: null };

    MEMO.set(q, { t: now, data: out });
    return res.json(out);
  } catch (e) {
    console.error("geocode error:", e);
    return res.status(500).json({ message: "Geocode failed" });
  }
}
