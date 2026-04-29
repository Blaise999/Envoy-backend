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

    pieces: { type: Number, default: 1, min: 0 },
    weightKg: { type: Number, default: 0, min: 0 },

    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "EUR" },

    shipmentRef: { type: Types.ObjectId, ref: "Shipment" },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { _id: false }
);

ShipmentLiteSchema.index({ status: 1, createdAt: -1, service: 1 }, { name: "idx_shipments_status_created_service" });
ShipmentLiteSchema.index(
  { trackingNumber: "text", from: "text", to: "text", toName: "text", service: "text" },
  { name: "text_shipments_quick" }
);

const AddressSchema = new Schema(
  {
    label: String,
    name: String,
    line1: String,
    line2: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
    phone: String,
    isDefault: { type: Boolean, default: false },
    externalId: String,
  },
  { _id: true, timestamps: true }
);

const PaymentMethodSchema = new Schema(
  {
    label: String,
    brand: String,
    last4: String,
    expMonth: Number,
    expYear: Number,
    default: { type: Boolean, default: false },
    provider: { type: String, enum: ["stripe", "paystack", "flutterwave", "mock"], default: "mock" },
    externalId: String,
    status: { type: String, enum: ["valid", "expired", "in_review", "inactive"], default: "valid" },
  },
  { _id: true, timestamps: true }
);

const PickupSchema = new Schema(
  {
    publicId: { type: String, index: true },
    date: { type: Date, required: true },
    window: { type: String, default: "13:00–17:00" },

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

/* ---------------- NEW: Quotes ---------------- */
const QuoteSchema = new Schema(
  {
    publicId: { type: String, index: true },
    from: String,
    to: String,
    service: { type: String, default: "Standard" },
    weightKg: { type: Number, default: 0, min: 0 },
    pieces: { type: Number, default: 1, min: 0 },
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "EUR" },
    expiresAt: { type: Date },
    status: { type: String, enum: ["active", "expired", "converted"], default: "active" },
    notes: String,
  },
  { _id: true, timestamps: true }
);

/* ---------------- NEW: Support tickets ---------------- */
const SupportMessageSchema = new Schema(
  {
    sender: { type: String, enum: ["user", "admin"], default: "user" },
    text: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    attachments: { type: [String], default: [] },
  },
  { _id: false }
);

const SupportTicketSchema = new Schema(
  {
    publicId: { type: String, index: true },
    subject: { type: String, default: "Support request" },
    category: {
      type: String,
      enum: ["delayed", "lost", "damaged", "wrong_address", "payment", "refund", "general"],
      default: "general",
    },
    relatedTracking: { type: String, default: "" },
    status: { type: String, enum: ["open", "pending", "resolved", "closed"], default: "open", index: true },
    messages: { type: [SupportMessageSchema], default: [] },
  },
  { _id: true, timestamps: true }
);

/* ---------------- NEW: notification prefs + profile ---------------- */
const NotificationPrefsSchema = new Schema(
  {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    pickup: { type: Boolean, default: true },
    transit: { type: Boolean, default: true },
    delivered: { type: Boolean, default: true },
    delays: { type: Boolean, default: true },
    promos: { type: Boolean, default: false },
  },
  { _id: false }
);

const ProfileSchema = new Schema(
  {
    accountType: { type: String, enum: ["individual", "business"], default: "individual" },
    company: String,
    taxId: String,
    contactPerson: String,
    businessAddress: String,
    referral: String,
    avatarUrl: String,
    loyaltyTier: { type: String, default: "Bronze" },
    referralCode: String,
  },
  { _id: false, strict: false, minimize: false }
);

const BillingByMonthSchema = new Schema(
  {
    ym: { type: String, required: true },
    sum: { type: Number, default: 0 },
  },
  { _id: false }
);

/* ------------------------------ Main schema ------------------------------ */

const UserDetailsSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    displayName: String,
    email: { type: String, index: true },
    phone: String,
    roles: { type: [String], default: ["customer"] },

    shipments: { type: [ShipmentLiteSchema], default: [] },
    addresses: { type: [AddressSchema], default: [] },
    paymentMethods: { type: [PaymentMethodSchema], default: [] },
    pickups: { type: [PickupSchema], default: [] },

    /* NEW arrays/sub-docs */
    quotes: { type: [QuoteSchema], default: [] },
    supportTickets: { type: [SupportTicketSchema], default: [] },
    notificationPrefs: { type: NotificationPrefsSchema, default: () => ({}) },
    profile: { type: ProfileSchema, default: () => ({}) },

    billing: {
      currency: { type: String, default: "EUR" },
      totalSpend: { type: Number, default: 0 },
      deliveredCount: { type: Number, default: 0 },
      inTransitCount: { type: Number, default: 0 },
      exceptionCount: { type: Number, default: 0 },
      byMonth: { type: [BillingByMonthSchema], default: [] },
      lastComputedAt: { type: Date },
      walletBalance: { type: Number, default: 0 },
    },

    adminOverlay: {
      active: { type: Boolean, default: false },
      appliedBy: { type: Types.ObjectId, ref: "User" },
      appliedAt: { type: Date },

      numbers: { type: Schema.Types.Mixed, default: {} },
      text:    { type: Schema.Types.Mixed, default: {} },

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

    meta: {
      source: { type: String, default: "user" },
      notes: String,
    },
  },
  { timestamps: true, minimize: false }
);

/* ---------------------------- Helper utilities --------------------------- */

function ymKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function computeBillingFromEmbedded(shipments, currency = "EUR", monthsBack = 6, walletBalance = 0) {
  const delivered = shipments.filter((s) => s.status === "Delivered").length;
  const inTransit = shipments.filter((s) => s.status === "In Transit").length;
  const exception = shipments.filter((s) => s.status === "Exception").length;

  const total = shipments.reduce((acc, s) => acc + (Number(s.price) || 0), 0);

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
    walletBalance: Math.round((walletBalance || 0) * 100) / 100,
  };
}

/* ------------------------------ Schema methods --------------------------- */

UserDetailsSchema.methods.recomputeBilling = function () {
  const wallet = this.billing?.walletBalance || 0;
  this.billing = computeBillingFromEmbedded(this.shipments, this.billing?.currency || "EUR", 6, wallet);
  return this.billing;
};

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
      shipments: shipments,
      addresses: addresses,
      paymentMethods: payments,
      pickups: pickups,
    },
  };

  this.recomputeBilling();
};

UserDetailsSchema.methods.toDashboardView = function () {
  const useOverlay = !!this.adminOverlay?.active;

  const arr = (realArr = [], overlayArr = []) =>
    realArr && realArr.length ? realArr : (useOverlay ? overlayArr : []);

  const mergedShipments = arr(this.shipments, this.adminOverlay?.bundleSnapshot?.shipments || []);
  const mergedAddresses = arr(this.addresses, this.adminOverlay?.bundleSnapshot?.addresses || []);
  const mergedPayments  = arr(this.paymentMethods, this.adminOverlay?.bundleSnapshot?.paymentMethods || []);
  const mergedPickups   = arr(this.pickups, this.adminOverlay?.bundleSnapshot?.pickups || []);

  const baseBilling = this.billing || { currency: "EUR", totalSpend: 0, deliveredCount: 0, inTransitCount: 0, exceptionCount: 0, byMonth: [], walletBalance: 0 };
  const ovrNums = (useOverlay && this.adminOverlay?.numbers) ? this.adminOverlay.numbers : null;

  const mergedBilling = {
    currency: baseBilling.currency || "EUR",
    totalSpend: Number(ovrNums?.totalSpend ?? baseBilling.totalSpend ?? 0),
    deliveredCount: Number(ovrNums?.deliveredCount ?? baseBilling.deliveredCount ?? 0),
    inTransitCount: Number(ovrNums?.inTransitCount ?? baseBilling.inTransitCount ?? 0),
    exceptionCount: Number(ovrNums?.exceptionCount ?? baseBilling.exceptionCount ?? 0),
    walletBalance: Number(ovrNums?.walletBalance ?? baseBilling.walletBalance ?? 0),
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
    quotes: this.quotes || [],
    supportTickets: this.supportTickets || [],
    notificationPrefs: this.notificationPrefs || {},
    profile: this.profile || {},

    billing: mergedBilling,

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
  const Shipment = mongoose.model("Shipment");
  const shipments = await Shipment.find({ userId: userId })
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
