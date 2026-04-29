// src/routes/users.routes.js
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import UserDetails from "../models/userDetails.model.js";
import User from "../models/User.js";
import { getMe, updateMe, deleteMe } from "../controllers/user.controller.js";

const router = Router();

/* ------------------------------------------------------------------
   Profile (the basic User doc — name/email/phone/address)
------------------------------------------------------------------- */
router.get("/me", requireAuth(), getMe);
router.put("/me", requireAuth(), updateMe);
router.delete("/me", requireAuth(), deleteMe);

/* ------------------------------------------------------------------
   Helper: load (or create) the UserDetails doc for the logged-in user
------------------------------------------------------------------- */
async function loadOwnDetails(req, res) {
  const userId = req.user?.sub || req.user?.id || req.user?._id;
  if (!userId) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return null;
  }
  let doc = await UserDetails.findOne({ user: userId });
  if (!doc) doc = await UserDetails.create({ user: userId });
  return doc;
}

/* ------------------------------------------------------------------
   GET /api/users/me/details   — full dashboard payload (merged view)
------------------------------------------------------------------- */
router.get("/me/details", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const view = typeof doc.toDashboardView === "function"
      ? doc.toDashboardView()
      : doc.toObject({ virtuals: true });
    res.json(view);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------
   PUT /api/users/me/details   — bulk save (used by Profile editor)
   Whitelisted to fields the user is allowed to mutate themselves.
------------------------------------------------------------------- */
router.put("/me/details", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;

    const allowed = [
      "displayName",
      "phone",
      "addresses",
      "paymentMethods",
      "pickups",
      "quotes",
      "supportTickets",
      "notificationPrefs",
      "profile",
    ];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
        doc[k] = req.body[k];
      }
    }
    await doc.save();
    const view = typeof doc.toDashboardView === "function"
      ? doc.toDashboardView()
      : doc.toObject({ virtuals: true });
    res.json(view);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------
   ADDRESS BOOK
------------------------------------------------------------------- */
router.post("/me/addresses", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const a = req.body || {};
    if (a.isDefault) {
      doc.addresses.forEach((x) => { x.isDefault = false; });
    }
    doc.addresses.push({
      label: a.label || a.name || "Address",
      name: a.name || "",
      line1: a.line1 || "",
      line2: a.line2 || "",
      city: a.city || "",
      state: a.state || "",
      postalCode: a.postalCode || "",
      country: a.country || "",
      phone: a.phone || "",
      isDefault: !!a.isDefault,
    });
    await doc.save();
    res.json(doc.addresses);
  } catch (err) { next(err); }
});

router.put("/me/addresses/:idx", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const i = Number(req.params.idx);
    if (!Number.isInteger(i) || i < 0 || i >= doc.addresses.length) {
      return res.status(404).json({ message: "Address not found" });
    }
    const patch = req.body || {};
    if (patch.isDefault) {
      doc.addresses.forEach((x, j) => { if (j !== i) x.isDefault = false; });
    }
    Object.assign(doc.addresses[i], patch);
    await doc.save();
    res.json(doc.addresses);
  } catch (err) { next(err); }
});

router.delete("/me/addresses/:idx", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const i = Number(req.params.idx);
    if (!Number.isInteger(i) || i < 0 || i >= doc.addresses.length) {
      return res.status(404).json({ message: "Address not found" });
    }
    doc.addresses.splice(i, 1);
    await doc.save();
    res.json(doc.addresses);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------
   PAYMENT METHODS
------------------------------------------------------------------- */
router.post("/me/payments", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const p = req.body || {};
    const last4 = String(p.last4 ?? "").replace(/\D/g, "").slice(-4);
    if (p.default) doc.paymentMethods.forEach((x) => { x.default = false; });
    doc.paymentMethods.push({
      label: p.label || p.brand || "Card",
      brand: p.brand || "",
      last4,
      expMonth: p.expMonth,
      expYear: p.expYear,
      default: !!p.default,
      provider: p.provider || "mock",
      status: "valid",
    });
    await doc.save();
    res.json(doc.paymentMethods);
  } catch (err) { next(err); }
});

router.delete("/me/payments/:idx", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const i = Number(req.params.idx);
    if (!Number.isInteger(i) || i < 0 || i >= doc.paymentMethods.length) {
      return res.status(404).json({ message: "Payment method not found" });
    }
    doc.paymentMethods.splice(i, 1);
    await doc.save();
    res.json(doc.paymentMethods);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------
   PICKUPS — schedule, edit, cancel
------------------------------------------------------------------- */
router.post("/me/pickups", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const p = req.body || {};
    const publicId = "PUP" + Math.random().toString(36).slice(2, 7).toUpperCase();
    doc.pickups.push({
      publicId,
      date: p.date ? new Date(p.date) : new Date(),
      window: p.window || "13:00–17:00",
      addressText: p.addressText || "",
      recurring: !!p.recurring,
      frequency: p.frequency || "WEEKLY",
      status: "Requested",
      instructions: p.instructions || "",
    });
    await doc.save();
    res.json(doc.pickups);
  } catch (err) { next(err); }
});

router.put("/me/pickups/:idx", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const i = Number(req.params.idx);
    if (!Number.isInteger(i) || i < 0 || i >= doc.pickups.length) {
      return res.status(404).json({ message: "Pickup not found" });
    }
    const patch = req.body || {};
    if (patch.date) patch.date = new Date(patch.date);
    Object.assign(doc.pickups[i], patch);
    await doc.save();
    res.json(doc.pickups);
  } catch (err) { next(err); }
});

router.delete("/me/pickups/:idx", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const i = Number(req.params.idx);
    if (!Number.isInteger(i) || i < 0 || i >= doc.pickups.length) {
      return res.status(404).json({ message: "Pickup not found" });
    }
    doc.pickups.splice(i, 1);
    await doc.save();
    res.json(doc.pickups);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------
   QUOTES — saved quotes a user can convert to a shipment later
------------------------------------------------------------------- */
router.post("/me/quotes", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const q = req.body || {};
    const publicId = "QT" + Math.random().toString(36).slice(2, 7).toUpperCase();
    const expiresAt = q.expiresAt
      ? new Date(q.expiresAt)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    doc.quotes.push({
      publicId,
      from: q.from || "",
      to: q.to || "",
      service: q.service || "Standard",
      weightKg: Number(q.weightKg || 0),
      pieces: Number(q.pieces || 1),
      price: Number(q.price || 0),
      currency: q.currency || "EUR",
      expiresAt,
      status: "active",
      notes: q.notes || "",
    });
    await doc.save();
    res.json(doc.quotes);
  } catch (err) { next(err); }
});

router.delete("/me/quotes/:idx", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const i = Number(req.params.idx);
    if (!Number.isInteger(i) || i < 0 || i >= doc.quotes.length) {
      return res.status(404).json({ message: "Quote not found" });
    }
    doc.quotes.splice(i, 1);
    await doc.save();
    res.json(doc.quotes);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------
   SUPPORT TICKETS — open / reply / close
------------------------------------------------------------------- */
router.post("/me/support", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const t = req.body || {};
    const publicId = "TK" + Math.random().toString(36).slice(2, 7).toUpperCase();
    doc.supportTickets.push({
      publicId,
      subject: t.subject || "Support request",
      category: t.category || "general",
      relatedTracking: t.relatedTracking || "",
      status: "open",
      messages: [{
        sender: "user",
        text: t.message || t.text || "",
        at: new Date(),
      }],
    });
    await doc.save();
    res.json(doc.supportTickets);
  } catch (err) { next(err); }
});

router.post("/me/support/:idx/reply", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const i = Number(req.params.idx);
    if (!Number.isInteger(i) || i < 0 || i >= doc.supportTickets.length) {
      return res.status(404).json({ message: "Ticket not found" });
    }
    const text = String(req.body?.message || req.body?.text || "").trim();
    if (!text) return res.status(400).json({ message: "Message required" });
    doc.supportTickets[i].messages.push({ sender: "user", text, at: new Date() });
    if (doc.supportTickets[i].status === "resolved") {
      doc.supportTickets[i].status = "open";
    }
    await doc.save();
    res.json(doc.supportTickets[i]);
  } catch (err) { next(err); }
});

router.delete("/me/support/:idx", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const i = Number(req.params.idx);
    if (!Number.isInteger(i) || i < 0 || i >= doc.supportTickets.length) {
      return res.status(404).json({ message: "Ticket not found" });
    }
    doc.supportTickets[i].status = "closed";
    await doc.save();
    res.json(doc.supportTickets[i]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------
   NOTIFICATION PREFERENCES
------------------------------------------------------------------- */
router.put("/me/notifications", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    doc.notificationPrefs = {
      ...(doc.notificationPrefs?.toObject ? doc.notificationPrefs.toObject() : doc.notificationPrefs || {}),
      ...(req.body || {}),
    };
    await doc.save();
    res.json(doc.notificationPrefs);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------
   PROFILE (business + personal extras stored on UserDetails)
------------------------------------------------------------------- */
router.put("/me/profile", requireAuth(), async (req, res, next) => {
  try {
    const doc = await loadOwnDetails(req, res);
    if (!doc) return;
    const body = req.body || {};

    if (body.displayName !== undefined) doc.displayName = body.displayName;
    if (body.phone !== undefined) doc.phone = body.phone;

    doc.profile = {
      ...(doc.profile?.toObject ? doc.profile.toObject() : doc.profile || {}),
      ...(body.profile || {}),
    };

    await doc.save();

    // Mirror name/phone onto the canonical User
    const userId = req.user?.sub || req.user?.id;
    if (userId && (body.displayName || body.phone)) {
      const update = {};
      if (body.displayName) update.name = body.displayName;
      if (body.phone) update.phone = body.phone;
      try { await User.findByIdAndUpdate(userId, update); } catch {}
    }

    res.json({
      displayName: doc.displayName,
      phone: doc.phone,
      profile: doc.profile,
    });
  } catch (err) { next(err); }
});

export default router;
