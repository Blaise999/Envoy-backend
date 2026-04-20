// src/models/userDetails.model.js  (ESM)
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

/* ----------------------------- Subdocuments ----------------------------- */

// What the dashboard actually renders per row (UI-shaped & denormalized)
const ShipmentLiteSchema = new Schema(
  {
    trackingNumber: { type: String, index: true },
    service: { type: String, enum: ["Standard", "Express", "Priority", "Freight"], required: true },
    serviceType: { type: String, enum: ["parcel", "freight"], default: "parcel" },
    status: {
      type: String,
      enum: ["Created", "Picked Up", "In Transit", "Out for Delivery", "Delivered", "Exception", "Cancelled"],
      default: "Created",
      index: true,
    },
    from: { type: String, default: "—" },
    to: { type: String, default: "—" },
    toName: { type: String, default: "" },

    // Parcel/freight UI fields
    pieces: { type: Number, default: 1, min: 0 },
    weightKg: { type: Number, default: 0, min: 0 },

    // Money
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "EUR" },

    // Source linkage if you have a canonical Shipment collection
    shipmentRef: { type: Types.ObjectId, ref: "Shipment" },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { _id: false }
);

ShipmentLiteSchema.index({ status: 1, createdAt: -1, service: 1 }, { name: "idx_shipments_status_created_service" });

// Quick text search for UI “Search” box (tracking/from/to/service/name)
ShipmentLiteSchema.index(
  { trackingNumber: "text", from: "text", to: "text", toName: "text", service: "text" },
  { name: "text_shipments_quick" }
);

const AddressSchema = new Schema(
  {
    label: String, // "HQ", "Warehouse" etc
    name: String,  // Contact person / company
    line1: String,
    line2: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
    phone: String,
    isDefault: { type: Boolean, default: false },
    // Optional external id if synced from another service
    externalId: String,
  },
  { _id: true, timestamps: true }
);

const PaymentMethodSchema = new Schema(
  {
    label: String,           // "Corporate Visa"
    brand: String,           // "visa", "mastercard"
    last4: String,           // "4242"
    expMonth: Number,
    expYear: Number,
    default: { type: Boolean, default: false },
    provider: { type: String, enum: ["stripe", "paystack", "flutterwave", "mock"], default: "mock" },
    externalId: String,      // pm_xxx or token
    status: { type: String, enum: ["valid", "expired", "in_review", "inactive"], default: "valid" },
  },
  { _id: true, timestamps: true }
);

const PickupSchema = new Schema(
  {
    // Keep the human ID visible in UI (e.g., "PUABC12")
    publicId: { type: String, index: true },
    date: { type: Date, required: true },     // normalize from UI input
    window: { type: String, default: "13:00–17:00" },

    // Either link to an address or keep a flattened snapshot (both is safest)
    addressRef: { type: Types.ObjectId },
    addressText: String,

    recurring: { type: Boolean, default: false },
    frequency: { type: String, enum: ["DAILY", "WEEKLY", "BIWEEKLY"], default: "WEEKLY" },

    status: {
      type: String,
      enum: ["Requested", "Scheduled", "In Progress", "Completed", "Cancelled"],
      default: "Requested",
      index: true,
    },

    instructions: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const BillingByMonthSchema = new Schema(
  {
    ym: { type: String, required: true }, // "YYYY-MM"
    sum: { type: Number, default: 0 },
  },
  { _id: false }
);

/* ------------------------------ Main schema ------------------------------ */

const UserDetailsSchema = new Schema(
  {
    // One doc per user
    user: { type: Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    /* Profile */
    displayName: String,
    email: { type: String, index: true },
    phone: String,
    roles: { type: [String], default: ["customer"] }, // e.g., ["customer", "admin"]

    /* Dashboard data (UI-shaped) — strict, real embedded */
    shipments: { type: [ShipmentLiteSchema], default: [] },
    addresses: { type: [AddressSchema], default: [] },
    paymentMethods: { type: [PaymentMethodSchema], default: [] },
    pickups: { type: [PickupSchema], default: [] },

    /* Billing aggregates (fast reads for Billing tab) */
    billing: {
      currency: { type: String, default: "EUR" },
      totalSpend: { type: Number, default: 0 },
      deliveredCount: { type: Number, default: 0 },
      inTransitCount: { type: Number, default: 0 },
      exceptionCount: { type: Number, default: 0 },
      byMonth: { type: [BillingByMonthSchema], default: [] }, // last 6 months precomputed
      lastComputedAt: { type: Date },
    },

    /* Admin overlay controls (for seeded/faked dashboards) — LOOSE on purpose */
    adminOverlay: {
      active: { type: Boolean, default: false }, // if true, UI can choose to show overlay elements first
      appliedBy: { type: Types.ObjectId, ref: "User" }, // admin user id
      appliedAt: { type: Date },

      // Allow quick tile overrides (no schema fights)
      numbers: { type: Schema.Types.Mixed, default: {} }, // e.g. { totalSpend, deliveredCount, inTransitCount, exceptionCount, totalShipments }
      text:    { type: Schema.Types.Mixed, default: {} }, // e.g. { banner }

      // Optional storage of the original bundle for auditing (flexible for Compass edits)
      bundleSnapshot: new Schema(
        {
          shipments:      { type: [Schema.Types.Mixed], default: [] },
          addresses:      { type: [Schema.Types.Mixed], default: [] },
          paymentMethods: { type: [Schema.Types.Mixed], default: [] },
          pickups:        { type: [Schema.Types.Mixed], default: [] },
        },
        { _id: false, strict: false, minimize: false }
      ),
    },

    /* Audit */
    meta: {
      source: { type: String, default: "user" }, // "user" | "overlay" | "merge"
      notes: String,
    },
  },
  { timestamps: true, minimize: false } // keep empty objects (esp. in overlay)
);

/* ---------------------------- Helper utilities --------------------------- */

function ymKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function computeBillingFromEmbedded(shipments, currency = "EUR", monthsBack = 6) {
  const delivered = shipments.filter((s) => s.status === "Delivered").length;
  const inTransit = shipments.filter((s) => s.status === "In Transit").length;
  const exception = shipments.filter((s) => s.status === "Exception").length;

  const total = shipments.reduce((acc, s) => acc + (Number(s.price) || 0), 0);

  // Build last N months buckets (including current month)
  const now = new Date();
  const keys = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    keys.push(ymKey(d));
  }
  const sums = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const s of shipments) {
    const k = ymKey(s.createdAt || s._id?.getTimestamp?.() || Date.now());
    if (k in sums) sums[k] += Number(s.price) || 0;
  }

  return {
    currency,
    totalSpend: Math.round(total * 100) / 100,
    deliveredCount: delivered,
    inTransitCount: inTransit,
    exceptionCount: exception,
    byMonth: keys.map((k) => ({ ym: k, sum: Math.round((sums[k] || 0) * 100) / 100 })),
    lastComputedAt: new Date(),
  };
}

/* ------------------------------ Schema methods --------------------------- */

// Use when you updated shipments/overlay & want billing fast.
UserDetailsSchema.methods.recomputeBilling = function () {
  this.billing = computeBillingFromEmbedded(this.shipments, this.billing?.currency || "EUR");
  return this.billing;
};

// Merge a *loose* overlay bundle (like your AdminMock.get(userId)) into the STRICT embedded arrays.
// options = { prepend: true } to show overlay rows first (your UI merges overlay before base)
UserDetailsSchema.methods.applyOverlayBundle = function (bundle = {}, adminId = null, options = { prepend: true }) {
  const { shipments = [], addresses = [], payments = [], pickups = [] } = bundle;

  const addShipments = shipments.map((s) => ({
    trackingNumber: s.trackingNumber || s.tracking || s.code,
    service:
      s.service ||
      (s.serviceType === "freight"
        ? "Freight"
        : ((s.parcel?.level || "Standard")[0].toUpperCase() + (s.parcel?.level || "Standard").slice(1))),
    serviceType: s.serviceType || "parcel",
    status:
      ({
        CREATED: "Created",
        PICKED_UP: "Picked Up",
        IN_TRANSIT: "In Transit",
        OUT_FOR_DELIVERY: "Out for Delivery",
        DELIVERED: "Delivered",
        EXCEPTION: "Exception",
        CANCELLED: "Cancelled",
      }[String(s.status || "").toUpperCase()]) || s.status || "Created",
    from: s.from || "—",
    to: s.to || "—",
    toName: s.toName || (s.recipientEmail ? String(s.recipientEmail).split("@")[0] : ""),
    pieces: Number(s.pieces ?? (s.serviceType === "freight" ? (s.freight?.pallets || 1) : 1)),
    weightKg: Number(s.weight ?? (s.serviceType === "freight" ? (s.freight?.weight || 0) : (s.parcel?.weight || 0))),
    price: Number(s.price || s.cost || 0),
    currency: s.currency || "EUR",
    createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
  }));

  const addAddrs = addresses.map((a) => ({
    label: a.label || a.name || "Address",
    name: a.name || "",
    line1: a.line1 || "",
    line2: a.line2 || "",
    city: a.city || "",
    state: a.state || "",
    postalCode: a.postalCode || a.postal || "",
    country: a.country || "",
    phone: a.phone || "",
    isDefault: !!a.isDefault,
    externalId: a.id || a._id || undefined,
  }));

  const expFromStr = (exp) => {
    const expStr = typeof exp === "string" ? exp.trim() : "";
    const [mmRaw = "", yyRaw = ""] = expStr.split("/");
    const mm = mmRaw ? Number(mmRaw) : undefined;
    const yy = yyRaw ? Number(yyRaw) : undefined;
    return { mm, yy };
  };

  const addPays = payments.map((p) => {
    const { mm, yy } = expFromStr(p.exp);
    return {
      label: p.label || p.brand || "Card",
      brand: p.brand || "",
      last4: String(p.last4 ?? "").replace(/\D/g, "").slice(-4),
      expMonth: p.expMonth ?? mm,
      expYear:  p.expYear  ?? yy,
      default: !!p.default,
      provider: p.provider || "mock",
      externalId: p.id || p._id || undefined,
      status: p.status || "valid",
    };
  });

  const addPickups = pickups.map((p) => ({
    publicId: p.publicId || p.id || p._id || undefined,
    date: p.date ? new Date(p.date) : new Date(),
    window: p.window || "13:00–17:00",
    addressRef: p.addressId || undefined,
    addressText: p.address || `${p.name || p.label || "Address"} — ${[p.line1, p.city].filter(Boolean).join(", ")}`,
    recurring: !!p.recurring,
    frequency: p.frequency || "WEEKLY",
    status: p.status || "Requested",
    instructions: p.instructions || "",
  }));

  if (options.prepend) {
    this.shipments = [...addShipments, ...this.shipments];
    this.addresses = [...addAddrs, ...this.addresses];
    this.paymentMethods = [...addPays, ...this.paymentMethods];
    this.pickups = [...addPickups, ...this.pickups];
  } else {
    this.shipments = [...this.shipments, ...addShipments];
    this.addresses = [...this.addresses, ...addAddrs];
    this.paymentMethods = [...this.paymentMethods, ...addPays];
    this.pickups = [...this.pickups, ...addPickups];
  }

  this.adminOverlay = {
    active: true,
    appliedBy: adminId || this.adminOverlay?.appliedBy || null,
    appliedAt: new Date(),
    numbers: this.adminOverlay?.numbers || {},
    text: this.adminOverlay?.text || {},
    bundleSnapshot: {
      shipments: shipments,       // keep raw Mixed snapshot for auditing
      addresses: addresses,
      paymentMethods: payments,
      pickups: pickups,
    },
  };

  this.recomputeBilling();
};

/**
 * Returns the merged view the dashboard expects.
 * - Real arrays win. If empty and overlay.active, falls back to overlay bundle arrays (Mixed).
 * - Billing starts from stored `billing`; overlay.numbers (if present) override top-line counts/totals.
 */
UserDetailsSchema.methods.toDashboardView = function () {
  const useOverlay = !!this.adminOverlay?.active;

  const arr = (realArr = [], overlayArr = []) =>
    realArr && realArr.length ? realArr : (useOverlay ? overlayArr : []);

  const mergedShipments = arr(this.shipments, this.adminOverlay?.bundleSnapshot?.shipments || []);
  const mergedAddresses = arr(this.addresses, this.adminOverlay?.bundleSnapshot?.addresses || []);
  const mergedPayments  = arr(this.paymentMethods, this.adminOverlay?.bundleSnapshot?.paymentMethods || []);
  const mergedPickups   = arr(this.pickups, this.adminOverlay?.bundleSnapshot?.pickups || []);

  // Start from computed/stored billing
  const baseBilling = this.billing || { currency: "EUR", totalSpend: 0, deliveredCount: 0, inTransitCount: 0, exceptionCount: 0, byMonth: [] };

  // Overlay can override headline numbers only (keeps currency/byMonth)
  const ovrNums = (useOverlay && this.adminOverlay?.numbers) ? this.adminOverlay.numbers : null;

  const mergedBilling = {
    currency: baseBilling.currency || "EUR",
    totalSpend: Number(ovrNums?.totalSpend ?? baseBilling.totalSpend ?? 0),
    deliveredCount: Number(ovrNums?.deliveredCount ?? baseBilling.deliveredCount ?? 0),
    inTransitCount: Number(ovrNums?.inTransitCount ?? baseBilling.inTransitCount ?? 0),
    exceptionCount: Number(ovrNums?.exceptionCount ?? baseBilling.exceptionCount ?? 0),
    byMonth: Array.isArray(baseBilling.byMonth) ? baseBilling.byMonth : [],
    lastComputedAt: baseBilling.lastComputedAt || new Date(),
  };

  return {
    user: this.user,
    displayName: this.displayName,
    email: this.email,
    phone: this.phone,
    roles: this.roles,

    shipments: mergedShipments,
    addresses: mergedAddresses,
    paymentMethods: mergedPayments,
    pickups: mergedPickups,

    billing: mergedBilling,

    // Optional: expose overlay meta so UI can show a small badge if desired
    adminOverlay: {
      active: useOverlay,
      appliedBy: this.adminOverlay?.appliedBy || null,
      appliedAt: this.adminOverlay?.appliedAt || null,
      text: this.adminOverlay?.text || {},
    },
    meta: this.meta || { source: "user" },
    updatedAt: this.updatedAt,
    createdAt: this.createdAt,
  };
};

/* ------------------------------ Pre-save hook ---------------------------- */

UserDetailsSchema.pre("save", function (next) {
  if (!this.billing || !this.billing.lastComputedAt) {
    this.recomputeBilling();
  }
  next();
});

/* ------------------------------ Static helpers --------------------------- */

UserDetailsSchema.statics.refreshFromShipmentCollection = async function (userId, currency = "EUR", monthsBack = 6) {
  const Shipment = mongoose.model("Shipment"); // assumes you have a Shipment model
  const shipments = await Shipment.find({ user: userId })
    .select("_id trackingNumber price currency status serviceType parcel freight from to recipientEmail createdAt")
    .lean();

  const mapped = shipments.map((s) => ({
    trackingNumber: s.trackingNumber,
    service:
      s.serviceType === "freight"
        ? "Freight"
        : ((s.parcel?.level || "Standard")[0].toUpperCase() + (s.parcel?.level || "Standard").slice(1)),
    serviceType: s.serviceType || "parcel",
    status:
      ({
        CREATED: "Created",
        PICKED_UP: "Picked Up",
        IN_TRANSIT: "In Transit",
        OUT_FOR_DELIVERY: "Out for Delivery",
        DELIVERED: "Delivered",
        EXCEPTION: "Exception",
        CANCELLED: "Cancelled",
      }[String(s.status || "").toUpperCase()]) || "Created",
    from: s.from || "—",
    to: s.to || "—",
    toName: s.recipientEmail ? String(s.recipientEmail).split("@")[0] : "",
    pieces: s.serviceType === "freight" ? (s.freight?.pallets || 1) : 1,
    weightKg: s.serviceType === "freight" ? (s.freight?.weight || 0) : (s.parcel?.weight || 0),
    price: Number(s.price || 0),
    currency: s.currency || currency,
    shipmentRef: s._id,
    createdAt: s.createdAt || new Date(),
  }));

  const billing = computeBillingFromEmbedded(mapped, currency, monthsBack);

  const doc = await this.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        shipments: mapped,
        "billing.currency": billing.currency,
        "billing.totalSpend": billing.totalSpend,
        "billing.deliveredCount": billing.deliveredCount,
        "billing.inTransitCount": billing.inTransitCount,
        "billing.exceptionCount": billing.exceptionCount,
        "billing.byMonth": billing.byMonth,
        "billing.lastComputedAt": billing.lastComputedAt,
      },
    },
    { new: true, upsert: true }
  );

  return doc;
};

/* --------------------------------- Export -------------------------------- */

UserDetailsSchema.set("toJSON", { virtuals: true });
UserDetailsSchema.set("toObject", { virtuals: true });

export const UserDetails =
  mongoose.models.UserDetails || mongoose.model("UserDetails", UserDetailsSchema);
export default mongoose.models.UserDetails || mongoose.model("UserDetails", UserDetailsSchema);
