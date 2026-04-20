// src/controllers/shipment.controller.js
// User-facing shipment controller:
//
// - POST /api/shipments            (authed)
// - POST /api/shipments/public     (guest)
// - GET  /api/shipments            (authed list)
// - GET  /api/shipments/:id        (authed get)
// - GET  /api/shipments/track/:id  (public)
// - POST /api/shipments/quote      (public)

import crypto from "crypto";
import mongoose from "mongoose";
import Shipment from "../models/Shipment.js";

const User = mongoose.models.User || mongoose.model("User");

/* ----------------------- helpers: minimal user linker ----------------------- */

function normEmail(email) {
  return (email || "").trim().toLowerCase();
}
function normPhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+44${digits.slice(1)}`;
  if (digits.length === 10) return `+44${digits}`;
  return `+${digits}`;
}
function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Try to find an existing user by email/phone.
 * If none exists:
 *   - If we have an email, create a lightweight user with a random password.
 *   - If we don't have an email, return null (stay guest).
 * Any failure during creation is swallowed and returns null (do not block shipment).
 */
async function findOrCreateUserByContact({ name, email, phone }) {
  const emailLower = normEmail(email);
  const phoneNorm = normPhone(phone);

  let u = null;

  // 1) find by email (case-insensitive)
  if (emailLower) {
    u = await User.findOne({
      email: { $regex: new RegExp(`^${escapeRegex(emailLower)}$`, "i") },
    });
  }

  // 2) find by phone (try common shapes)
  if (!u && phoneNorm) {
    u =
      (await User.findOne({ phone: phoneNorm })) ||
      (await User.findOne({ "phones.normalized": phoneNorm })) ||
      (await User.findOne({ phones: phoneNorm }));
  }

  if (u) return u;

  // 3) create only if we have an email; otherwise stay guest
  if (!emailLower) return null;

  try {
    const randomPwd = crypto.randomBytes(16).toString("hex");
    const doc = await User.create({
      name: name || emailLower.split("@")[0],
      email: emailLower,
      password: randomPwd, // satisfies schema requirement
      phone: phoneNorm || undefined,
    });
    return doc;
  } catch (e) {
    console.warn("[userLinker] Could not create user; proceeding as guest:", e?.message || e);
    return null;
  }
}

/* ----------------------- misc helpers (existing) ----------------------- */

function normalizePlace(place) {
  if (!place) return "";
  if (typeof place === "string") return place.trim();
  const city = [place.city, place.state].filter(Boolean).join(", ").trim();
  const country = (place.country || "").trim();
  return [city || null, country || null].filter(Boolean).join(", ").trim();
}
function normalizeAddress(addr) {
  if (!addr || typeof addr !== "string") return "";
  return addr.replace(/\s+/g, " ").trim();
}
function generateTrackingNumber() {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GE${Date.now().toString(36).toUpperCase()}${rand}`;
}

function calcParcelRate(parcel, serviceLevel = "standard") {
  const l = +parcel.length || 0;
  const w = +parcel.width || 0;
  const h = +parcel.height || 0;
  const actual = +parcel.weight || 0;
  const volKg = l && w && h ? (l * w * h) / 5000 : 0;
  const billable = Math.max(actual, volKg);
  const isExpress = (serviceLevel || "").toLowerCase() === "express";
  const base = isExpress ? 18 : 10;
  const perKg = isExpress ? 6.0 : 4.0;
  const price = Math.max(9, Math.ceil(base + billable * perKg));
  const eta = isExpress ? "24–72 hours" : "2–5 business days";
  return { currency: "EUR", price, billable, eta };
}

function calcFreightRate(freight) {
  const pallets = +freight.pallets || 1;
  const l = +freight.length || 0;
  const w = +freight.width || 0;
  const h = +freight.height || 0;
  const actual = (+freight.weight || 0) * pallets;
  const divisor = (freight.mode || "air").toLowerCase() === "air" ? 6000 : 5000;
  const volPer = l && w && h ? (l * w * h) / divisor : 0;
  const billable = Math.max(actual, volPer * pallets);

  let base = 0,
    perKg = 0,
    eta = "";
  const mode = (freight.mode || "air").toLowerCase();
  if (mode === "air") {
    base = 150;
    perKg = 2.2;
    eta = "2–7 days door-to-door";
  } else if (mode === "sea") {
    base = 90;
    perKg = 1.0;
    eta = "12–35 days port-to-door";
  } else {
    base = 120;
    perKg = 1.4;
    eta = "2–10 days door-to-door";
  }
  const price = Math.max(25, Math.ceil(base + billable * perKg));
  return { currency: "EUR", price, billable, eta };
}

function inferServiceType(body) {
  return body && body.freight ? "freight" : "parcel";
}

// capture both shipper/recipient; include address for recipient
function pickContacts(body) {
  const c = body.contact || {};
  return {
    shipper: {
      name: c.shipperName || c.name || "",
      email: c.shipperEmail || c.email || "",
      phone: c.shipperPhone || c.phone || "",
    },
    recipient: {
      name: c.recipientName || "",
      phone: c.recipientPhone || "",
      email: body.recipientEmail || "",
      address: normalizeAddress(body.recipientAddress || c.recipientAddress || ""),
    },
  };
}

/* ----------------------- NEW: photos sanitizer (robust) ----------------------- */

const MAX_PHOTOS = 6;

// Allow blob urls + normal https image urls (don’t be overly strict)
function isSafeUrl(u = "") {
  const s = String(u || "");
  if (!s) return false;
  if (!/^https?:\/\//i.test(s)) return false;
  return true;
}

function sanitizeGoodsPhotos(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];

  for (const p of arr) {
    if (!p) continue;

    // allow string url
    if (typeof p === "string") {
      if (!isSafeUrl(p)) continue;
      out.push({ url: p, name: "Photo" });
      continue;
    }

    // allow object
    if (typeof p === "object") {
      const url = p.url || p.href;
      if (!isSafeUrl(url)) continue;

      const ct = String(p.contentType || p.type || "").toLowerCase();
      // If ct exists, restrict to images; if ct missing, still allow (some clients omit it)
      if (ct && !ct.startsWith("image/")) continue;

      out.push({
        url,
        name: p.name || p.pathname || "Photo",
        pathname: p.pathname || "",
        size: Number(p.size || 0) || 0,
        contentType: p.contentType || p.type || "",
      });
    }

    if (out.length >= MAX_PHOTOS) break;
  }

  return out;
}

/* ----------------------- controllers ----------------------- */

// POST /api/shipments  (authed)
export const createShipment = async (req, res) => {
  try {
    const body = req.body || {};
    const serviceType = body.serviceType || inferServiceType(body);

    const fromStr = normalizePlace(body.from);
    const toStr = normalizePlace(body.to);
    if (!fromStr || !toStr) return res.status(400).json({ message: "from and to are required" });
    if (!body.recipientEmail) return res.status(400).json({ message: "recipientEmail is required" });

    const recipientAddress = normalizeAddress(body.recipientAddress);
    if (serviceType === "parcel" && (!recipientAddress || recipientAddress.length < 6)) {
      return res.status(400).json({ message: "recipientAddress is required for parcel shipments" });
    }

    const pricing =
      serviceType === "freight"
        ? body.freight
          ? calcFreightRate(body.freight)
          : (() => {
              throw new Error("freight payload required");
            })()
        : body.parcel
        ? calcParcelRate(body.parcel, body.serviceLevel || body.parcel?.level || "standard")
        : (() => {
            throw new Error("parcel payload required");
          })();

    // Prefer the authenticated user, else resolve from contact
    let userId = req.user?.sub || req.user?._id || null;
    if (!userId) {
      const c = body.contact || body;
      const u = await findOrCreateUserByContact({
        name: c.name || c.shipperName,
        email: c.email || c.shipperEmail || body.recipientEmail,
        phone: c.phone || c.shipperPhone,
      });
      userId = u?._id || null;
    }

    const contacts = pickContacts(body);

    // ✅ NEW: pull photos from body (or nested) and store in meta (schema-safe)
    const goodsPhotos = sanitizeGoodsPhotos(
      body.goodsPhotos || body.parcel?.goodsPhotos || body.freight?.goodsPhotos || []
    );
    const shipmentKey = String(body.shipmentKey || body.meta?.shipmentKey || "").trim();

    const doc = await Shipment.create({
      userId,
      serviceType,
      from: fromStr,
      to: toStr,
      recipientEmail: body.recipientEmail,
      recipientAddress: recipientAddress || undefined,

      parcel:
        serviceType === "parcel"
          ? {
              weight: body.parcel?.weight,
              length: body.parcel?.length,
              width: body.parcel?.width,
              height: body.parcel?.height,
              value: body.parcel?.value,
              contents: body.parcel?.contents,
              level: body.serviceLevel || body.parcel?.level || "standard",
            }
          : undefined,

      freight:
        serviceType === "freight"
          ? {
              mode: (body.freight?.mode || "air").toLowerCase(),
              pallets: body.freight?.pallets,
              length: body.freight?.length,
              width: body.freight?.width,
              height: body.freight?.height,
              weight: body.freight?.weight,
              incoterm: body.freight?.incoterm || "DAP",
              notes: body.freight?.notes,
            }
          : undefined,

      currency: pricing.currency,
      price: pricing.price,
      eta: pricing.eta,
      billable: pricing.billable,

      trackingNumber: generateTrackingNumber(),
      status: "CREATED",
      timeline: [{ status: "CREATED", at: new Date(), note: "Booking created" }],

      meta: {
        ...(body.meta || {}),
        source: req.user ? "web_auth" : "web_guest",
        contacts,
        shipmentKey: shipmentKey || undefined,
        goodsPhotos, // ✅ stored here so it always persists even if schema is strict
      },
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error("createShipment error:", err);
    const status = err?.message?.includes("required") ? 400 : 500;
    return res.status(status).json({ message: err.message || "Failed to create shipment" });
  }
};

// POST /api/shipments/public  (guest)
export const createShipmentPublic = async (req, res) => {
  try {
    const body = req.body || {};
    const serviceType = body.serviceType || inferServiceType(body);

    const fromStr = normalizePlace(body.from);
    const toStr = normalizePlace(body.to);
    if (!fromStr || !toStr) return res.status(400).json({ message: "from and to are required" });
    if (!body.recipientEmail) return res.status(400).json({ message: "recipientEmail is required" });

    const recipientAddress = normalizeAddress(body.recipientAddress);
    if (serviceType === "parcel" && (!recipientAddress || recipientAddress.length < 6)) {
      return res.status(400).json({ message: "recipientAddress is required for parcel shipments" });
    }

    const pricing =
      serviceType === "freight"
        ? body.freight
          ? calcFreightRate(body.freight)
          : (() => {
              throw new Error("freight payload required");
            })()
        : body.parcel
        ? calcParcelRate(body.parcel, body.serviceLevel || body.parcel?.level || "standard")
        : (() => {
            throw new Error("parcel payload required");
          })();

    // Find or create a user (email required to create; otherwise guest)
    const c = body.contact || body;
    const u = await findOrCreateUserByContact({
      name: c.name || c.shipperName,
      email: c.email || c.shipperEmail || body.recipientEmail,
      phone: c.phone || c.shipperPhone,
    });

    const contacts = pickContacts(body);

    // ✅ NEW: save goods photos in meta
    const goodsPhotos = sanitizeGoodsPhotos(
      body.goodsPhotos || body.parcel?.goodsPhotos || body.freight?.goodsPhotos || []
    );
    const shipmentKey = String(body.shipmentKey || body.meta?.shipmentKey || "").trim();

    const doc = await Shipment.create({
      userId: u?._id || null,
      serviceType,
      from: fromStr,
      to: toStr,
      recipientEmail: body.recipientEmail,
      recipientAddress: recipientAddress || undefined,

      parcel:
        serviceType === "parcel"
          ? {
              weight: body.parcel?.weight,
              length: body.parcel?.length,
              width: body.parcel?.width,
              height: body.parcel?.height,
              value: body.parcel?.value,
              contents: body.parcel?.contents,
              level: body.serviceLevel || body.parcel?.level || "standard",
            }
          : undefined,

      freight:
        serviceType === "freight"
          ? {
              mode: (body.freight?.mode || "air").toLowerCase(),
              pallets: body.freight?.pallets,
              length: body.freight?.length,
              width: body.freight?.width,
              height: body.freight?.height,
              weight: body.freight?.weight,
              incoterm: body.freight?.incoterm || "DAP",
              notes: body.freight?.notes,
            }
          : undefined,

      currency: pricing.currency,
      price: pricing.price,
      eta: pricing.eta,
      billable: pricing.billable,

      trackingNumber: generateTrackingNumber(),
      status: "CREATED",
      timeline: [{ status: "CREATED", at: new Date(), note: "Booking created" }],

      meta: {
        ...(body.meta || {}),
        source: "web_guest",
        contacts,
        shipmentKey: shipmentKey || undefined,
        goodsPhotos,
      },
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error("createShipmentPublic error:", err);
    return res.status(500).json({ message: "Could not create shipment" });
  }
};

// GET /api/shipments
export const listMyShipments = async (req, res) => {
  try {
    const items = await Shipment.find({ userId: req.user.sub }).sort({ createdAt: -1 });
    return res.json(items);
  } catch (err) {
    console.error("listMyShipments error:", err);
    return res.status(500).json({ message: "Failed to list shipments" });
  }
};

// GET /api/shipments/:id
export const getMyShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const s = await Shipment.findOne({ _id: id, userId: req.user.sub });
    if (!s) return res.status(404).json({ message: "Shipment not found" });
    return res.json(s);
  } catch (err) {
    console.error("getMyShipment error:", err);
    return res.status(500).json({ message: "Failed to fetch shipment" });
  }
};

// GET /api/shipments/track/:tracking  (public)
export const trackByTrackingId = async (req, res) => {
  try {
    const { tracking } = req.params;
    const s = await Shipment.findOne({ trackingNumber: tracking }).lean();
    if (!s) return res.status(404).json({ message: "Tracking ID not found" });

    const uiStatus = String(s.status || "CREATED")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const contacts = s.meta?.contacts || {};
    const shipper = contacts.shipper || null;
    const recipient = {
      ...(contacts.recipient || {}),
      email: s.recipientEmail || contacts.recipient?.email || "",
      address: s.recipientAddress || contacts.recipient?.address || "",
    };

    // ✅ NEW: return goods photos from meta (schema-safe) + fallback shapes
    const goodsPhotos =
      s.meta?.goodsPhotos ||
      s.goodsPhotos ||
      s.photos ||
      s.parcel?.goodsPhotos ||
      s.freight?.goodsPhotos ||
      [];

    return res.json({
      trackingNumber: s.trackingNumber,
      status: uiStatus,
      eta: s.eta,
      lastLocation: s.lastLocation || null,
      from: s.from || null,
      to: s.to || null,
      serviceType: s.serviceType,

      parcel: s.parcel
        ? {
            weight: s.parcel.weight,
            value: s.parcel.value,
            contents: s.parcel.contents,
            level: s.parcel.level,
          }
        : null,
      freight: s.freight
        ? { mode: s.freight.mode, pallets: s.freight.pallets, weight: s.freight.weight }
        : null,

      timeline: s.timeline || [],

      price: s.price,
      currency: s.currency,
      billable: s.billable,

      recipientEmail: s.recipientEmail || recipient.email || "",
      recipientAddress: s.recipientAddress || recipient.address || "",

      shipper,
      recipient,

      // ✅ THIS is what your TrackPage is looking for
      goodsPhotos,

      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
    });
  } catch (err) {
    console.error("trackByTrackingId error:", err);
    return res.status(500).json({ message: "Failed to fetch tracking" });
  }
};

// POST /api/shipments/quote  (public)
export const quote = async (req, res) => {
  try {
    const { parcel, serviceLevel, freight } = req.body || {};
    if (!parcel && !freight) {
      return res.status(400).json({ message: "parcel or freight payload required" });
    }
    const out = parcel
      ? calcParcelRate(parcel, serviceLevel || parcel.level || "standard")
      : calcFreightRate(freight);
    return res.json(out);
  } catch (err) {
    console.error("quote error:", err);
    return res.status(500).json({ message: "Failed to calculate quote" });
  }
};
