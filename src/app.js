// src/app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { notFound, errorHandler } from "./utils/errors.js";

// Ensure models are registered at boot (safe even if also imported in routes)
import "./models/userDetails.model.js";

// normal routes
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/users.routes.js";
import shipmentRoutes from "./routes/shipment.routes.js";
import emailRoutes from "./routes/email.routes.js";
import devRoutes from "./routes/dev.routes.js";
import adminMockRoutes from "./routes/admin/admin.mock.routes.js";

// ✅ Geocode router — make sure this file default-exports a router
//    (e.g. export default router) and that the path + .js extension are correct.
import geocodeRoutes from "./routes/geocode.routes.js";

// admin routes
import adminAuthRoutes from "./routes/admin/auth.routes.js";
import adminUsersRoutes from "./routes/admin/users.routes.js";
import adminShipmentsRoutes from "./routes/admin/shipments.routes.js";
// NEW: admin user details (GET/PUT /api/admin/users/:id/details)
import adminUserDetailsRoutes from "./routes/admin/users.details.routes.js";

const app = express();

/* -------------------- Security & basics -------------------- */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

/* -------------------- CORS -------------------- */
const PROD_ORIGINS = [
  "https://shipenvoy.com",
  "https://www.shipenvoy.com",
];

const DEV_DEFAULTS = [
  "http://127.0.0.1:5173", "http://localhost:5173",
  "http://127.0.0.1:5174", "http://localhost:5174",
  "http://127.0.0.1:5175", "http://localhost:5175",
  "http://127.0.0.1:4173", "http://localhost:4173",
  "http://127.0.0.1:3000", "http://localhost:3000",
  "http://127.0.0.1:3001", "http://localhost:3001",
];

// read env allow-list (comma separated)
const envOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const singleOrigin = (process.env.CORS_ORIGIN || "").trim();
if (singleOrigin) envOrigins.push(singleOrigin);

// build final set
const allowedOrigins = new Set([
  ...PROD_ORIGINS,
  ...envOrigins,
  ...(process.env.NODE_ENV !== "production" ? DEV_DEFAULTS : []),
]);

function isVercelPreview(origin) {
  try {
    const host = new URL(origin).hostname;
    return host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

const corsConfig = {
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  origin(origin, cb) {
    // Allow server-to-server/no-Origin requests
    if (!origin) return cb(null, true);

    if (allowedOrigins.has(origin)) return cb(null, true);
    if (isVercelPreview(origin)) return cb(null, true);

    // In non-prod, allow any localhost:* as a safety net
    if (
      process.env.NODE_ENV !== "production" &&
      /^(https?:\/\/)?(localhost|127\.0\.0\.1):\d+$/.test(origin)
    ) {
      return cb(null, true);
    }

    console.warn("CORS blocked:", origin);
    return cb(new Error("CORS blocked"));
  },
};

app.use(cors(corsConfig));
// Ensure preflight succeeds with same config
app.options("*", cors(corsConfig));

/* -------------------- Parsers -------------------- */
// Body parsers (bumped to 2mb for admin JSON editor payloads)
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// JSON parse error -> 400
app.use((err, _req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ ok: false, error: "Invalid JSON payload" });
  }
  next(err);
});

/* -------------------- Logging & proxy -------------------- */
app.use(morgan("dev"));

// Trust proxy (Render et al.)
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

/* -------------------- Rate limiting -------------------- */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/* -------------------- Healthcheck -------------------- */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), pid: process.pid });
});

/* -------------------- Dev routes (only non-prod) -------------------- */
if (process.env.NODE_ENV !== "production") {
  app.use("/api/dev", devRoutes);
}

/* -------------------- Routes -------------------- */
// public
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/email", emailRoutes);

// ✅ Geocode endpoint (e.g. GET /api/geocode?q=Paris,FR)
app.use("/api", geocodeRoutes);

// admin
app.use("/api/admin/auth", authLimiter, adminAuthRoutes);
app.use("/api/admin/mock", adminMockRoutes);
app.use("/api/admin/users", adminUsersRoutes);
// NEW: /api/admin/users/:id/details (must be mounted under the same base)
app.use("/api/admin/users", adminUserDetailsRoutes);
app.use("/api/admin/shipments", adminShipmentsRoutes);

/* -------------------- 404 + errors (ALWAYS LAST) -------------------- */
app.use(notFound);
app.use(errorHandler);

export default app;
