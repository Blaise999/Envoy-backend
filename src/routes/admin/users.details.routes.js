// /src/routes/admin/users.details.routes.js
import { Router } from "express";
import mongoose from "mongoose";

// Ensure model is registered
import "../../models/userDetails.model.js";

const UserDetails = mongoose.model("UserDetails");
const router = Router();

/* ---------- Auth helpers (assumes req.user is set by a global requireAuth) ---------- */
function requireAdmin(req, res, next) {
  if (req.user && (req.user.role === "admin" || req.user.isAdmin)) return next();
  return res.status(403).json({ message: "Admin only" });
}

/* ---------- Utils ---------- */
function defaultDashboard() {
  return {
    shipments: [],
    addresses: [],
    paymentMethods: [],
    pickups: [],
    billing: {
      currency: "EUR",
      totalSpend: 0,
      deliveredCount: 0,
      inTransitCount: 0,
      exceptionCount: 0,
      byMonth: [],
      lastComputedAt: new Date()
    },
    adminOverlay: { active: false }
  };
}

function asMergedView(doc) {
  if (!doc) return defaultDashboard();
  // prefer model helper if available
  if (typeof doc.toDashboardView === "function") return doc.toDashboardView();

  // fallback merge (minimal)
  const useOverlay = !!doc.adminOverlay?.active;
  const pickArr = (realArr = [], overlayArr = []) =>
    (realArr && realArr.length) ? realArr : (useOverlay ? (overlayArr || []) : []);

  const mergedBilling = {
    currency: doc.billing?.currency || "EUR",
    totalSpend: Number(doc.adminOverlay?.numbers?.totalSpend ?? doc.billing?.totalSpend ?? 0),
    deliveredCount: Number(doc.adminOverlay?.numbers?.deliveredCount ?? doc.billing?.deliveredCount ?? 0),
    inTransitCount: Number(doc.adminOverlay?.numbers?.inTransitCount ?? doc.billing?.inTransitCount ?? 0),
    exceptionCount: Number(doc.adminOverlay?.numbers?.exceptionCount ?? doc.billing?.exceptionCount ?? 0),
    byMonth: Array.isArray(doc.billing?.byMonth) ? doc.billing.byMonth : [],
    lastComputedAt: doc.billing?.lastComputedAt || new Date()
  };

  return {
    user: doc.user,
    displayName: doc.displayName,
    email: doc.email,
    phone: doc.phone,
    roles: doc.roles,
    shipments: pickArr(doc.shipments, doc.adminOverlay?.bundleSnapshot?.shipments),
    addresses: pickArr(doc.addresses, doc.adminOverlay?.bundleSnapshot?.addresses),
    paymentMethods: pickArr(doc.paymentMethods, doc.adminOverlay?.bundleSnapshot?.paymentMethods),
    pickups: pickArr(doc.pickups, doc.adminOverlay?.bundleSnapshot?.pickups),
    billing: mergedBilling,
    adminOverlay: {
      active: useOverlay,
      appliedBy: doc.adminOverlay?.appliedBy || null,
      appliedAt: doc.adminOverlay?.appliedAt || null,
      text: doc.adminOverlay?.text || {}
    },
    meta: doc.meta || { source: "user" },
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt
  };
}

/* ---------- GET /api/admin/users/:id/details ---------- */
router.get("/:id/details", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const merged = String(req.query.merged ?? "1") === "1";

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    // upsert empty doc so we always return JSON (avoid 204s)
    const doc = await UserDetails.findOneAndUpdate(
      { user: id },
      { $setOnInsert: { user: id } },
      { new: true, upsert: true }
    );

    return res.status(200).json(merged ? asMergedView(doc) : doc.toObject({ virtuals: true }));
  } catch (err) {
    console.error("GET /admin/users/:id/details error:", err);
    res.status(500).json({ message: "Failed to load details" });
  }
});

/* ---------- PUT /api/admin/users/:id/details?recompute=0|1&merged=0|1 ---------- */
router.put("/:id/details", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const wantRecompute = String(req.query.recompute ?? "1") === "1";
    const merged = String(req.query.merged ?? "1") === "1";

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    let doc = await UserDetails.findOne({ user: id });
    if (!doc) doc = new UserDetails({ user: id });

    const payload = req.body || {};
    const allowed = [
      "displayName","email","phone","roles",
      "shipments","addresses","paymentMethods","pickups",
      "billing","adminOverlay","meta"
    ];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) {
        doc[k] = payload[k];
      }
    }
    doc.user = id;

    if (wantRecompute && typeof doc.recomputeBilling === "function") {
      doc.recomputeBilling();
    }

    await doc.save();
    return res.status(200).json(merged ? asMergedView(doc) : doc.toObject({ virtuals: true }));
  } catch (err) {
    console.error("PUT /admin/users/:id/details error:", err);
    if (err?.code === 11000) {
      return res.status(409).json({ message: "UserDetails already exists (conflict)" });
    }
    res.status(500).json({ message: err?.message || "Failed to save details" });
  }
});

export default router;
