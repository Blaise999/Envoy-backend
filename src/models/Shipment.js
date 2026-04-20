// src/models/Shipment.js
import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

/**
 * Shipment model
 * - Supports parcel & freight
 * - Simple string locations (e.g., "Lagos, Nigeria")
 * - Stores recipientEmail + recipientAddress (back-compat)
 * - NEW: shipperContact { name,email,phone }
 * - NEW: recipientContact { name,email,phone }
 * - Quote snapshot (currency, price, eta, billable)
 * - Tracking fields: trackingNumber, status, lastLocation, timeline
 * - idempotencyKey (unique, sparse)
 */

/* ---------- Subschemas ---------- */
const ParcelSchema = new Schema(
  {
    weight: { type: Number, min: 0, default: 0 }, // kg
    length: { type: Number, min: 0, default: 0 }, // cm
    width:  { type: Number, min: 0, default: 0 }, // cm
    height: { type: Number, min: 0, default: 0 }, // cm
    contents: { type: String, default: "" },
    value: { type: Number, min: 0, default: 0 }, // declared value
    level: { type: String, enum: ["standard", "express", "priority"], default: "express" },
  },
  { _id: false }
);

const FreightSchema = new Schema(
  {
    mode: { type: String, enum: ["air", "sea", "road"], default: "air" },
    pallets: { type: Number, min: 1, default: 1 },
    length: { type: Number, min: 0, default: 0 }, // cm (per pallet)
    width:  { type: Number, min: 0, default: 0 },
    height: { type: Number, min: 0, default: 0 },
    weight: { type: Number, min: 0, default: 0 }, // kg (per pallet)
    incoterm: { type: String, default: "DAP" },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const TimelineItemSchema = new Schema(
  {
    status: {
      type: String,
      enum: [
        "CREATED",
        "PICKED_UP",
        "IN_TRANSIT",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "EXCEPTION",
        "CANCELLED",
      ],
      required: true,
    },
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
);

/* ---------- Contacts ---------- */
const ContactSchema = new Schema(
  {
    name:  { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
  { _id: false }
);

/* ---------- Main schema ---------- */
const ShipmentSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: false, default: null },

    serviceType: {
      type: String,
      enum: ["parcel", "freight"],
      required: true,
      default: "parcel",
    },

    // simple text locations to match the ExpressPage inputs
    from: { type: String, required: true, trim: true }, // e.g. "Lagos, Nigeria"
    to:   { type: String, required: true, trim: true }, // e.g. "London, United Kingdom"

    // contacts
    shipperContact:   { type: ContactSchema, default: () => ({}) },   // NEW
    recipientContact: { type: ContactSchema, default: () => ({}) },   // NEW

    // back-compat recipient fields used by existing controllers
    recipientEmail:   { type: String, trim: true, default: "" },
    recipientAddress: { type: String, trim: true, default: "" },

    // sub-docs
    parcel: ParcelSchema,
    freight: FreightSchema,

    // quote snapshot
    currency: { type: String, default: "EUR" },
    price: { type: Number, min: 0, default: 0 }, // total
    eta: { type: String, default: "" },          // text ETA
    etaAt: { type: Date, default: null },        // exact ETA datetime
    billable: { type: Number, min: 0, default: 0 }, // kg

    // tracking
    trackingNumber: { type: String, unique: true, index: true },
    status: {
      type: String,
      enum: [
        "CREATED",
        "PICKED_UP",
        "IN_TRANSIT",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "EXCEPTION",
        "CANCELLED",
      ],
      default: "CREATED",
      index: true,
    },
    lastLocation: { type: String, default: "" },
    timeline: { type: [TimelineItemSchema], default: [] },

    // files (labels, proofs of delivery)
    labelUrls: { type: [String], default: [] },
    proofUrls: { type: [String], default: [] },

    // idempotency (to dedupe client retries)
    idempotencyKey: { type: String, index: true, unique: true, sparse: true },

    // misc metadata
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// helpful compound indexes
ShipmentSchema.index({ status: 1, createdAt: -1 });
ShipmentSchema.index({ userId: 1, createdAt: -1 }); // fast "my shipments" queries

/* ---------- Helpers ---------- */
function hasAnyValues(obj) {
  if (!obj) return false;
  const src = typeof obj.toObject === "function" ? obj.toObject() : obj;
  return Object.values(src).some(
    (v) =>
      v !== undefined &&
      v !== null &&
      v !== "" &&
      !(typeof v === "number" && isNaN(v))
  );
}

function makeTracking() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rnd = Math.floor(100000 + Math.random() * 900000);
  return `GE${yy}${mm}${dd}${rnd}`;
}

/* ---------- Auto-infer + seed before validation ---------- */
ShipmentSchema.pre("validate", function (next) {
  // Infer serviceType
  if (!this.serviceType) {
    this.serviceType = hasAnyValues(this.freight) ? "freight" : "parcel";
  }

  // Ensure tracking number exists
  if (!this.trackingNumber) {
    this.trackingNumber = makeTracking();
  }

  // Normalize emails to lowercase everywhere
  if (this.recipientEmail) {
    this.recipientEmail = String(this.recipientEmail).trim().toLowerCase();
  }
  if (this.shipperContact?.email) {
    this.shipperContact.email = String(this.shipperContact.email).trim().toLowerCase();
  }
  if (this.recipientContact?.email) {
    this.recipientContact.email = String(this.recipientContact.email).trim().toLowerCase();
  }

  // If recipientContact.email missing but recipientEmail provided (back-compat), mirror it
  if (!this.recipientContact?.email && this.recipientEmail) {
    this.recipientContact = this.recipientContact || {};
    this.recipientContact.email = this.recipientEmail;
  }
  // And vice-versa (so old code reading recipientEmail still works)
  if (!this.recipientEmail && this.recipientContact?.email) {
    this.recipientEmail = this.recipientContact.email;
  }

  // Normalize address
  if (this.recipientAddress && typeof this.recipientAddress === "string") {
    this.recipientAddress = this.recipientAddress.replace(/\s+/g, " ").trim();
  }

  // Optional strictness: require address for parcels
  if (this.serviceType === "parcel" && (!this.recipientAddress || this.recipientAddress.length < 6)) {
    return next(new Error("Recipient address is required for parcel shipments."));
  }

  // Seed timeline
  if (this.isNew && (!this.timeline || this.timeline.length === 0)) {
    this.timeline = [{ status: "CREATED", at: new Date(), note: "Shipment created" }];
  }

  next();
});

// Unified ETA display
ShipmentSchema.virtual("etaDisplay").get(function () {
  if (this.etaAt) return this.etaAt.toISOString();
  return this.eta || "";
});

export default model("Shipment", ShipmentSchema);
