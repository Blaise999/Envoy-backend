// src/services/tracking.service.js
import Shipment from "../models/Shipment.js";

/** Generate a unique tracking number like GE-8K3F1Q2Z */
export async function generateTrackingNumber() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = () =>
    Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

  for (let i = 0; i < 6; i++) {
    const t = `GE-${code()}`;
    const exists = await Shipment.findOne({ trackingNumber: t }).lean();
    if (!exists) return t;
  }
  return `GE-${Date.now().toString(36).toUpperCase()}`;
}

/** Append a timeline event (status/note) and optional lastLocation */
export async function appendTrackingEvent({ shipmentId, status, note, lastLocation }) {
  const s = await Shipment.findById(shipmentId);
  if (!s) throw new Error("Shipment not found");

  if (status) s.status = status;
  if (lastLocation) s.lastLocation = lastLocation;

  s.timeline.push({
    status: status || s.status,
    at: new Date(),
    note: note || "Updated",
  });

  await s.save();
  return s;
}

/** Public lookup by tracking number — safe fields only */
export async function getPublicTracking(trackingNumber) {
  const s = await Shipment.findOne({ trackingNumber }).lean();
  if (!s) return null;

  return {
    trackingNumber: s.trackingNumber,
    status: s.status,
    eta: s.eta,
    lastLocation: s.lastLocation || null,
    from: s.from || null,
    to: s.to || null,
    parcel: s.parcel
      ? { weight: s.parcel.weight, value: s.parcel.value, contents: s.parcel.contents }
      : null,
    freight: s.freight
      ? { mode: s.freight.mode, pallets: s.freight.pallets, weight: s.freight.weight }
      : null,
    price: s.price,
    currency: s.currency,
    timeline: s.timeline || [],
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
