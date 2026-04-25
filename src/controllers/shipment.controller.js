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

  if (!digits) return "";
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+44${digits.slice(1)}`;
  if (digits.length === 10) return `+44${digits}`;

  return `+${digits}`;
}

function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findOrCreateUserByContact({ name, email, phone }) {
  const emailLower = normEmail(email);
  const phoneNorm = normPhone(phone);

  let u = null;

  if (emailLower) {
    u = await User.findOne({
      email: { $regex: new RegExp(`^${escapeRegex(emailLower)}$`, "i") },
    });
  }

  if (!u && phoneNorm) {
    u =
      (await User.findOne({ phone: phoneNorm })) ||
      (await User.findOne({ "phones.normalized": phoneNorm })) ||
      (await User.findOne({ phones: phoneNorm }));
  }

  if (u) return u;

  if (!emailLower) return null;

  try {
    const randomPwd = crypto.randomBytes(16).toString("hex");

    const doc = await User.create({
      name: name || emailLower.split("@")[0],
      email: emailLower,
      password: randomPwd,
      phone: phoneNorm || undefined,
    });

    return doc;
  } catch (e) {
    console.warn("[userLinker] Could not create user; proceeding as guest:", e?.message || e);
    return null;
  }
}

/* ----------------------- misc helpers ----------------------- */

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

  const level = String(serviceLevel || "standard").toLowerCase();

  const isExpress = level === "express";
  const isPriority = level === "priority";

  const base = isPriority ? 24 : isExpress ? 18 : 10;
  const perKg = isPriority ? 7.5 : isExpress ? 6.0 : 4.0;

  const price = Math.max(9, Math.ceil(base + billable * perKg));

  const eta = isPriority
    ? "12–48 hours"
    : isExpress
    ? "24–72 hours"
    : "2–5 business days";

  return { currency: "EUR", price, billable, eta };
}

function calcFreightRate(freight) {
  const pallets = +freight.pallets || 1;
  const l = +freight.length || 0;
  const w = +freight.width || 0;
  const h = +freight.height || 0;
  const actual = (+freight.weight || 0) * pallets;

  const mode = (freight.mode || "air").toLowerCase();
  const divisor = mode === "air" ? 6000 : 5000;

  const volPer = l && w && h ? (l * w * h) / divisor : 0;
  const billable = Math.max(actual, volPer * pallets);

  let base = 0;
  let perKg = 0;
  let eta = "";

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

function pickContacts(body) {
  const c = body.contact || {};

  return {
    shipper: {
      name: c.shipperName || body.shipperName || c.name || "",
      email: c.shipperEmail || body.shipperEmail || c.email || "",
      phone: c.shipperPhone || body.shipperPhone || c.phone || "",
    },
    recipient: {
      name: c.recipientName || body.recipientName || body.receiverName || body.consigneeName || "",
      phone: c.recipientPhone || body.recipientPhone || body.receiverPhone || body.consigneePhone || "",
      email: body.recipientEmail || c.recipientEmail || body.receiverEmail || body.consigneeEmail || "",
      address: normalizeAddress(
        body.recipientAddress ||
          c.recipientAddress ||
          body.deliveryAddress ||
          body.receiverAddress ||
          body.consigneeAddress ||
          ""
      ),
    },
  };
}

function makeContactShape(contacts = {}, fallback = {}) {
  const shipper = {
    ...(contacts.shipper || {}),
    name:
      contacts.shipper?.name ||
      fallback.shipperName ||
      fallback.senderName ||
      "",
    email:
      contacts.shipper?.email ||
      fallback.shipperEmail ||
      fallback.senderEmail ||
      "",
    phone:
      contacts.shipper?.phone ||
      fallback.shipperPhone ||
      fallback.senderPhone ||
      "",
  };

  const recipient = {
    ...(contacts.recipient || {}),
    name:
      contacts.recipient?.name ||
      fallback.recipientName ||
      fallback.receiverName ||
      fallback.consigneeName ||
      "",
    phone:
      contacts.recipient?.phone ||
      fallback.recipientPhone ||
      fallback.receiverPhone ||
      fallback.consigneePhone ||
      "",
    email:
      fallback.recipientEmail ||
      contacts.recipient?.email ||
      fallback.receiverEmail ||
      fallback.consigneeEmail ||
      "",
    address:
      fallback.recipientAddress ||
      contacts.recipient?.address ||
      fallback.receiverAddress ||
      fallback.consigneeAddress ||
      "",
  };

  const contact = {
    shipperName: shipper.name || "",
    shipperEmail: shipper.email || "",
    shipperPhone: shipper.phone || "",
    recipientName: recipient.name || "",
    recipientPhone: recipient.phone || "",
    recipientEmail: recipient.email || "",
    recipientAddress: recipient.address || "",
  };

  return { shipper, recipient, contact };
}

/* ----------------------- photos sanitizer ----------------------- */

const MAX_PHOTOS = 6;

function isSafeUrl(u = "") {
  const s = String(u || "");
  if (!s) return false;
  return /^https?:\/\//i.test(s);
}

function splitGoodsPhotos(input) {
  let arr = input;

  if (typeof arr === "string") {
    const trimmed = arr.trim();

    if (trimmed.startsWith("[")) {
      try {
        arr = JSON.parse(trimmed);
      } catch {
        arr = [];
      }
    } else if (isSafeUrl(trimmed)) {
      arr = [trimmed];
    } else {
      const matches = trimmed.match(/https?:\/\/[^\s'"<>\\)]+/g) || [];
      arr = matches;
    }
  }

  if (!Array.isArray(arr)) arr = [];

  const urls = [];
  const meta = [];

  for (const p of arr) {
    if (!p) continue;

    if (typeof p === "string") {
      const s = p.trim();

      if (s.startsWith("{") || s.startsWith("[")) {
        try {
          const parsed = JSON.parse(s);
          const recoveredUrl = parsed?.url || parsed?.href;

          if (isSafeUrl(recoveredUrl)) {
            urls.push(recoveredUrl);
            meta.push({
              url: recoveredUrl,
              name: parsed?.name || "Photo",
              pathname: parsed?.pathname || "",
              size: Number(parsed?.size || 0) || 0,
              contentType: parsed?.contentType || parsed?.type || "",
            });
          }
        } catch {
          const match = s.match(/https?:\/\/[^\s'"<>\\]+/);
          if (match && isSafeUrl(match[0])) {
            urls.push(match[0]);
            meta.push({ url: match[0], name: "Photo" });
          }
        }
      } else if (isSafeUrl(s)) {
        urls.push(s);
        meta.push({ url: s, name: "Photo" });
      }

      if (urls.length >= MAX_PHOTOS) break;
      continue;
    }

    if (typeof p === "object") {
      const url = p.url || p.href;
      if (!isSafeUrl(url)) continue;

      const ct = String(p.contentType || p.type || "").toLowerCase();
      if (ct && !ct.startsWith("image/")) continue;

      urls.push(url);
      meta.push({
        url,
        name: p.name || p.pathname || "Photo",
        pathname: p.pathname || "",
        size: Number(p.size || 0) || 0,
        contentType: p.contentType || p.type || "",
      });

      if (urls.length >= MAX_PHOTOS) break;
    }
  }

  const seen = new Set();

  const cleanUrls = urls.filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  const cleanMeta = meta.filter((item, index, self) => {
    const url = item?.url;
    if (!url) return false;
    return self.findIndex((x) => x?.url === url) === index;
  });

  return { urls: cleanUrls, meta: cleanMeta };
}

function sanitizeGoodsPhotos(input) {
  return splitGoodsPhotos(input).meta;
}

/* ----------------------- controllers ----------------------- */

// POST /api/shipments  (authed)
export const createShipment = async (req, res) => {
  try {
    const body = req.body || {};
    const serviceType = body.serviceType || inferServiceType(body);

    const fromStr = normalizePlace(body.from);
    const toStr = normalizePlace(body.to);

    if (!fromStr || !toStr) {
      return res.status(400).json({ message: "from and to are required" });
    }

    if (!body.recipientEmail) {
      return res.status(400).json({ message: "recipientEmail is required" });
    }

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

    const { urls: rawAuthedUrls, meta: goodsPhotoMeta } = splitGoodsPhotos(
      body.goodsPhotos || body.parcel?.goodsPhotos || body.freight?.goodsPhotos || []
    );

    const clientMeta = Array.isArray(body.goodsPhotosMeta)
      ? splitGoodsPhotos(body.goodsPhotosMeta).meta
      : [];

    const combinedMeta = goodsPhotoMeta.length ? goodsPhotoMeta : clientMeta;

    const goodsPhotoUrls = (Array.isArray(rawAuthedUrls) ? rawAuthedUrls : [])
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object" && typeof x.url === "string") return x.url;
        return null;
      })
      .filter((s) => typeof s === "string" && /^https?:\/\//i.test(s));

    const shipmentKey = String(body.shipmentKey || body.meta?.shipmentKey || "").trim();

    const doc = await Shipment.create({
      userId,
      serviceType,
      from: fromStr,
      to: toStr,

      recipientEmail: body.recipientEmail,
      recipientAddress: recipientAddress || undefined,

      // ✅ Direct searchable receiver/shipper fields too
      shipperName: contacts.shipper.name || undefined,
      shipperEmail: contacts.shipper.email || undefined,
      shipperPhone: contacts.shipper.phone || undefined,
      recipientName: contacts.recipient.name || undefined,
      recipientPhone: contacts.recipient.phone || undefined,

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

      goodsPhotos: goodsPhotoUrls,
      goodsPhotosMeta: combinedMeta,
      shipmentKey: shipmentKey || "",

      paymentMethod:
        body.paymentMethod === "card" ||
        body.paymentMethod === "cod" ||
        body.paymentMethod === "payInPerson"
          ? body.paymentMethod
          : "",

      paymentStatus:
        body.paymentStatus || (body.paymentMethod === "payInPerson" ? "pending_in_person" : ""),

      promoCode: String(body.promoCode || "").trim(),
      testBooking: !!body.testBooking || String(body.promoCode || "").trim() === "011205",

      meta: {
        ...(body.meta || {}),
        source: req.user ? "web_auth" : "web_guest",
        contacts,
        contact: {
          shipperName: contacts.shipper.name || "",
          shipperEmail: contacts.shipper.email || "",
          shipperPhone: contacts.shipper.phone || "",
          recipientName: contacts.recipient.name || "",
          recipientPhone: contacts.recipient.phone || "",
          recipientEmail: contacts.recipient.email || "",
          recipientAddress: contacts.recipient.address || "",
        },
        shipmentKey: shipmentKey || undefined,
        goodsPhotos: combinedMeta,
      },
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error("createShipment error:", err);

    if (err?.name === "ValidationError") {
      const fields = Object.keys(err.errors || {}).map((k) => ({
        field: k,
        message: err.errors[k]?.message,
        kind: err.errors[k]?.kind,
      }));

      return res.status(400).json({
        message: "Validation failed",
        details: fields,
        raw: err.message,
      });
    }

    const status = err?.message?.includes("required") ? 400 : 500;
    return res.status(status).json({ message: err.message || "Failed to create shipment" });
  }
};

// POST /api/shipments/public  (guest)
export const createShipmentPublic = async (req, res) => {
  try {
    const body = req.body || {};

    console.log("[createShipmentPublic] incoming:", {
      serviceType: body.serviceType,
      from: body.from,
      to: body.to,
      recipientEmail: body.recipientEmail ? String(body.recipientEmail).slice(0, 60) : "(missing)",
      recipientAddress: body.recipientAddress ? String(body.recipientAddress).slice(0, 60) : "(missing)",
      contact: {
        shipperName: body.contact?.shipperName || body.shipperName || "",
        shipperEmail: body.contact?.shipperEmail || body.shipperEmail || "",
        shipperPhone: body.contact?.shipperPhone || body.shipperPhone || "",
        recipientName: body.contact?.recipientName || body.recipientName || "",
        recipientPhone: body.contact?.recipientPhone || body.recipientPhone || "",
      },
      hasParcel: !!body.parcel,
      hasFreight: !!body.freight,
      paymentMethod: body.paymentMethod,
      promoCode: body.promoCode,
      goodsPhotosLen: Array.isArray(body.goodsPhotos) ? body.goodsPhotos.length : 0,
      shipmentKey: body.shipmentKey,
    });

    const serviceType = body.serviceType || inferServiceType(body);

    const fromStr = normalizePlace(body.from);
    const toStr = normalizePlace(body.to);

    if (!fromStr || !toStr) {
      return res.status(400).json({ message: "from and to are required" });
    }

    if (!body.recipientEmail) {
      return res.status(400).json({ message: "recipientEmail is required" });
    }

    const recipientAddress = normalizeAddress(body.recipientAddress);

    if (serviceType === "parcel" && (!recipientAddress || recipientAddress.length < 6)) {
      return res.status(400).json({
        message: "recipientAddress is required for parcel shipments (minimum 6 characters)",
      });
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

    const c = body.contact || body;

    const u = await findOrCreateUserByContact({
      name: c.name || c.shipperName,
      email: c.email || c.shipperEmail || body.recipientEmail,
      phone: c.phone || c.shipperPhone,
    });

    const contacts = pickContacts(body);

    const { urls: rawGoodsPhotoUrls, meta: goodsPhotoMeta } = splitGoodsPhotos(
      body.goodsPhotos || body.parcel?.goodsPhotos || body.freight?.goodsPhotos || []
    );

    const clientMeta = Array.isArray(body.goodsPhotosMeta)
      ? splitGoodsPhotos(body.goodsPhotosMeta).meta
      : [];

    const combinedMeta = goodsPhotoMeta.length ? goodsPhotoMeta : clientMeta;

    const goodsPhotoUrls = (Array.isArray(rawGoodsPhotoUrls) ? rawGoodsPhotoUrls : [])
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object" && typeof x.url === "string") return x.url;
        return null;
      })
      .filter((s) => typeof s === "string" && /^https?:\/\//i.test(s));

    if (goodsPhotoUrls.length === 0 && (body.goodsPhotos || body.goodsPhotosMeta)) {
      console.warn("[createShipmentPublic] goodsPhotos received but none valid after sanitization:", {
        rawType: typeof body.goodsPhotos,
        isArray: Array.isArray(body.goodsPhotos),
        first: Array.isArray(body.goodsPhotos) ? body.goodsPhotos[0] : body.goodsPhotos,
      });
    }

    const shipmentKey = String(body.shipmentKey || body.meta?.shipmentKey || "").trim();

    const doc = await Shipment.create({
      userId: u?._id || null,
      serviceType,
      from: fromStr,
      to: toStr,

      recipientEmail: body.recipientEmail,
      recipientAddress: recipientAddress || undefined,

      // ✅ Direct searchable receiver/shipper fields too
      shipperName: contacts.shipper.name || undefined,
      shipperEmail: contacts.shipper.email || undefined,
      shipperPhone: contacts.shipper.phone || undefined,
      recipientName: contacts.recipient.name || undefined,
      recipientPhone: contacts.recipient.phone || undefined,

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

      goodsPhotos: goodsPhotoUrls,
      goodsPhotosMeta: combinedMeta,
      shipmentKey: shipmentKey || "",

      paymentMethod:
        body.paymentMethod === "card" ||
        body.paymentMethod === "cod" ||
        body.paymentMethod === "payInPerson"
          ? body.paymentMethod
          : "",

      paymentStatus:
        body.paymentStatus || (body.paymentMethod === "payInPerson" ? "pending_in_person" : ""),

      promoCode: String(body.promoCode || "").trim(),
      testBooking: !!body.testBooking || String(body.promoCode || "").trim() === "011205",

      meta: {
        ...(body.meta || {}),
        source: "web_guest",
        contacts,
        contact: {
          shipperName: contacts.shipper.name || "",
          shipperEmail: contacts.shipper.email || "",
          shipperPhone: contacts.shipper.phone || "",
          recipientName: contacts.recipient.name || "",
          recipientPhone: contacts.recipient.phone || "",
          recipientEmail: contacts.recipient.email || "",
          recipientAddress: contacts.recipient.address || "",
        },
        shipmentKey: shipmentKey || undefined,
        goodsPhotos: combinedMeta,
      },
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error("createShipmentPublic error:", err?.name, err?.message, err?.stack);

    if (err?.name === "ValidationError") {
      const fields = Object.keys(err.errors || {}).map((k) => ({
        field: k,
        message: err.errors[k]?.message,
        kind: err.errors[k]?.kind,
      }));

      return res.status(400).json({
        message: "Validation failed",
        details: fields,
        raw: err.message,
      });
    }

    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Duplicate key",
        key: err.keyPattern,
        value: err.keyValue,
      });
    }

    return res.status(500).json({
      message: err?.message || "Could not create shipment",
      name: err?.name,
    });
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

    const storedContacts = s.meta?.contacts || {};

    const { shipper, recipient, contact } = makeContactShape(storedContacts, {
      shipperName: s.shipperName || s.meta?.contact?.shipperName || "",
      shipperEmail: s.shipperEmail || s.meta?.contact?.shipperEmail || "",
      shipperPhone: s.shipperPhone || s.meta?.contact?.shipperPhone || "",

      recipientName: s.recipientName || s.meta?.contact?.recipientName || "",
      recipientPhone: s.recipientPhone || s.meta?.contact?.recipientPhone || "",
      recipientEmail: s.recipientEmail || s.meta?.contact?.recipientEmail || "",
      recipientAddress: s.recipientAddress || s.meta?.contact?.recipientAddress || "",
    });

    const rawPhotos = [
      ...(Array.isArray(s.goodsPhotos) ? s.goodsPhotos : []),
      ...(Array.isArray(s.goodsPhotosMeta) ? s.goodsPhotosMeta : []),
      ...(Array.isArray(s.meta?.goodsPhotos) ? s.meta.goodsPhotos : []),
      ...(Array.isArray(s.photos) ? s.photos : []),
      ...(Array.isArray(s.parcel?.goodsPhotos) ? s.parcel.goodsPhotos : []),
      ...(Array.isArray(s.freight?.goodsPhotos) ? s.freight.goodsPhotos : []),
    ];

    const seen = new Set();
    const goodsPhotos = [];

    for (const p of rawPhotos) {
      const url = typeof p === "string" ? p : p?.url || p?.href || "";
      if (!url || seen.has(url)) continue;
      if (!/^https?:\/\//i.test(url)) continue;

      seen.add(url);
      goodsPhotos.push(url);
    }

    const STATUS_ORDER = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

    const STATUS_LABELS = {
      CREATED: "Ordered",
      PICKED_UP: "Picked Up",
      IN_TRANSIT: "In Transit",
      OUT_FOR_DELIVERY: "Out for Delivery",
      DELIVERED: "Delivered",
      EXCEPTION: "Exception",
      CANCELLED: "Cancelled",
    };

    const currentCode = String(s.status || "CREATED").toUpperCase();
    const currentIdx = STATUS_ORDER.indexOf(currentCode);
    const rawTimeline = Array.isArray(s.timeline) ? s.timeline : [];

    const steppedTimeline = STATUS_ORDER.map((code, i) => {
      const hit = rawTimeline.find((t) => String(t.status).toUpperCase() === code);
      const isDone = currentIdx >= 0 ? i <= currentIdx : !!hit;
      const isCurrent = currentIdx >= 0 && i === currentIdx;
      const when = hit?.at ? new Date(hit.at) : null;

      return {
        label: STATUS_LABELS[code] || code,
        time: when
          ? when.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "—",
        done: isDone,
        current: isCurrent,
        status: code,
      };
    });

    const updates = rawTimeline
      .slice()
      .reverse()
      .map((t) => {
        const when = t.at ? new Date(t.at) : null;

        return {
          date: when
            ? when.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "",
          note: t.note || `Status: ${STATUS_LABELS[String(t.status).toUpperCase()] || t.status}`,
        };
      });

    let estimatedDelivery = s.eta || "";

    if (s.etaAt) {
      const d = new Date(s.etaAt);

      if (!isNaN(d.getTime())) {
        estimatedDelivery = d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }

    const weightKg =
      s.serviceType === "freight"
        ? Number(s.freight?.weight || 0) * Number(s.freight?.pallets || 1)
        : Number(s.parcel?.weight || 0);

    return res.json({
      trackingNumber: s.trackingNumber,
      id: s._id,

      status: uiStatus,
      statusCode: currentCode,

      eta: s.eta,
      estimatedDelivery,

      lastLocation: s.lastLocation || null,

      from: s.from || null,
      to: s.to || null,

      serviceType: s.serviceType,

      service:
        s.serviceType === "freight"
          ? `Freight (${s.freight?.mode || "air"})`
          : s.parcel?.level
          ? s.parcel.level.charAt(0).toUpperCase() + s.parcel.level.slice(1)
          : "Standard",

      weight: weightKg ? `${weightKg} kg` : "",

      parcel: s.parcel
        ? {
            weight: s.parcel.weight,
            value: s.parcel.value,
            contents: s.parcel.contents,
            level: s.parcel.level,
          }
        : null,

      freight: s.freight
        ? {
            mode: s.freight.mode,
            pallets: s.freight.pallets,
            weight: s.freight.weight,
          }
        : null,

      timeline: steppedTimeline,
      rawTimeline,
      updates,

      price: s.price,
      currency: s.currency,
      billable: s.billable,

      // ✅ Direct fields for frontend
      recipientEmail: recipient.email || "",
      recipientAddress: recipient.address || "",
      recipientName: recipient.name || "",
      recipientPhone: recipient.phone || "",

      shipperName: shipper.name || "",
      shipperEmail: shipper.email || "",
      shipperPhone: shipper.phone || "",

      // ✅ Structured fields
      shipper,
      recipient,

      // ✅ TrackPage-friendly field
      contact,

      goodsPhotos,

      shipmentKey: s.shipmentKey || s.meta?.shipmentKey || "",

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