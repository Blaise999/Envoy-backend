# Envoy Backend — Rebrand Notes

Forked from the GlobalEdge backend (Node.js + Express + MongoDB).

## What changed
- **Brand name:** GlobalEdge / Global Edge / global-edge → Envoy everywhere
- **Domains:** `shipglobaledge.com` → `shipenvoy.com` (prod origin, CORS allow-list, email sender, support email, reply-to)
- **Tracking ID prefix:** mock generator now emits `EV...` instead of `GE...` (`src/lib/mockGen.js`)
- **Email templates:** brand name, logo URL, support email, address block, subjects all updated (`src/mail/template.js`, `src/config/mailer.js`, `src/services/email.service.js`)
- **Controllers:** brand defaults in `src/controllers/admin/shipments.controller.js` now say "Envoy" / "Envoy Logistics"
- **Brand color:** default `#E11D48` (rose) → `#10B981` (emerald-500) to match the frontend
- **Geocoder UA:** `GlobalEdgeTracker/1.0` → `EnvoyTracker/1.0` (`src/controllers/geocodecontroller.js`)
- **README:** fixed UTF-16 encoding, now says `# envoy`

## What was intentionally preserved
- **MongoDB URI** — the db name `globaledge` is still inside the connection string. Changing it would point at a different (empty) database and break production. Rename the db in MongoDB Atlas first, then update the URI.
- **JWT_SECRET** and **RESEND_API_KEY** — these are your real secrets, untouched.

## Environment
`.env` has been rebranded with:
- `CLIENT_ORIGIN=https://shipenvoy.com`
- `CORS_ORIGINS=https://shipenvoy.com,https://www.shipenvoy.com,https://envoy-frontend.vercel.app,...`
- `EMAIL_FROM="Envoy Courier <noreply@shipenvoy.com>"`
- `APP_NAME=Envoy Courier`

You'll want to register `shipenvoy.com` / `envoy-frontend.vercel.app` before going live.

## Run it
```
npm install
npm start     # or `node src/server.js` / whatever scripts section says
```

Backend project didn't ship with a `package.json` — if it's missing, the stack is:
Express, Mongoose, bcrypt/bcryptjs, jsonwebtoken, cors, helmet, morgan, dotenv, resend, express-rate-limit (adjust to taste based on what `require`s you see).

## Loose ends worth reviewing
- `src/mail/template.js` still references `https://yourcdn.com/envoy-logo.png` — swap to your actual logo URL when you have a CDN
- Example tracking ID in template.js sample is `EVMEX2TC95N4RN` (was `GEMEX...`) — fine for demo, ignore in prod
- MongoDB db rename (see above) before you flip live traffic
