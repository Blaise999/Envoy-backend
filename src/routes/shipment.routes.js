// src/routes/shipment.routes.js
import { Router } from "express";
import * as ShipmentCtrl from "../controllers/shipment.controller.js";
import { requireAuth } from "../middleware/auth.js";

const r = Router();

/* ----------------------------- Resolve handlers ----------------------------- */
// Destructure common handlers (these should exist in your controller)
const {
  createShipment,
  listMyShipments,
  getMyShipment,
  trackByTrackingId,
  quote,
} = ShipmentCtrl;

// Public create can be exported under either name; resolve at runtime
const createPublic =
  ShipmentCtrl.createShipmentPublic || ShipmentCtrl.createPublicShipment;

// If neither is exported, respond with a clear error (don’t crash the app)
const createPublicHandler =
  createPublic ||
  ((req, res) => {
    res.status(500).json({
      error:
        "Public shipment handler not found. Export `createShipmentPublic` (or `createPublicShipment`) from src/controllers/shipment.controller.js",
    });
  });

/* --------------------------- Small middlewares --------------------------- */
// Pass the idempotency key through to controllers (optional use)
function passIdempotencyKey(req, _res, next) {
  // Support common header variants
  req.idempotencyKey =
    req.headers["idempotency-key"] ||
    req.headers["x-idempotency-key"] ||
    null;
  next();
}

/* =========================
   Public (no auth required)
   ========================= */
r.post("/quote", quote);
r.get("/track/:tracking", trackByTrackingId);

// Guest booking (no auth). Alias /public and /guest to the same handler.
r.post("/public", passIdempotencyKey, createPublicHandler);
r.post("/guest", passIdempotencyKey, createPublicHandler);

/* =========================
   Authenticated user routes
   ========================= */
r.post("/", requireAuth, passIdempotencyKey, createShipment);
r.get("/", requireAuth, listMyShipments);
r.get("/:id", requireAuth, getMyShipment);

export default r;
