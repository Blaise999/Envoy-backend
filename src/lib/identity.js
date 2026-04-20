// src/lib/identity.js
export function normEmail(email) {
  return (email || "").trim().toLowerCase();
}

// For production use libphonenumber-js; quick-and-dirty fallback:
export function normPhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  // naive: assume NG if 10/11 digits; else leave as-is
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.length === 10) return `+44${digits}`;   // 0XXXXXXXXX -> +234XXXXXXXXXX (adjust to your reality)
  if (digits.length === 11 && digits.startsWith("0")) return `+44${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * Extract best-effort contact from a shipment payload.
 * Adjust keys to your client payload shape.
 */
export function extractContact(payload = {}) {
  const c =
    payload.contact ||
    payload.booker ||
    payload.sender ||
    payload.customer ||
    {};
  return {
    name: c.name || payload.name || "",
    email: c.email || payload.email || "",
    phone: c.phone || payload.phone || "",
  };
}
