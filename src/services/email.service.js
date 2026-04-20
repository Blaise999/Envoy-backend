// src/services/email.service.js
import { sendMail } from "../config/mailer.js";

/**
 * Envoy email service.
 * All emails share the Envoy visual language: emerald accent (#10b981),
 * Envoy wordmark, generous whitespace, and mobile-first table layout.
 */

const BRAND = {
  name: "Envoy",
  color: "#10b981",
  darkColor: "#059669",
  supportEmail: "hello@shipenvoy.com",
  address: "21 Wharf Road, London N1 7GS, UK",
};

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Reusable branded email wrapper. Takes a content block and wraps with
// Envoy header + footer. Mobile-responsive, dark-mode aware.
function wrapEnvoyEmail({ title, preheader, bodyHtml }) {
  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>${escapeHtml(title)}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .email-bg { background:#0f172a !important; }
      .email-card { background:#1e293b !important; color:#e2e8f0 !important; }
      .email-muted { color:#94a3b8 !important; }
    }
    a { text-decoration:none; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,system-ui,'Segoe UI',Arial,sans-serif;" class="email-bg">
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
    ${escapeHtml(preheader || "")}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;" class="email-bg">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:24px 28px 20px;background:#ffffff;border-radius:16px 16px 0 0;" class="email-card">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:32px;height:32px;background:${BRAND.color};border-radius:8px;text-align:center;vertical-align:middle;">
                    <span style="font:900 18px Arial,sans-serif;color:#fff;display:inline-block;transform:rotate(-15deg);">✈</span>
                  </td>
                  <td style="padding-left:10px;font:900 20px -apple-system,system-ui,'Segoe UI',Arial,sans-serif;color:#0f172a;letter-spacing:-0.02em;">
                    Envoy
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:0 28px 28px;background:#ffffff;border-radius:0 0 16px 16px;" class="email-card">
              ${bodyHtml}
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 20px;">
              <p style="margin:0;font:12px/1.5 -apple-system,system-ui;color:#94a3b8;" class="email-muted">
                <b style="color:#475569;">Envoy Logistics Ltd.</b> · ${BRAND.address}<br>
                <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.color};">${BRAND.supportEmail}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Generic email sender (Resend in prod, console in dev).
 * If you pass plain HTML it's wrapped in the Envoy shell automatically.
 */
export async function sendGenericEmail({ to, subject, html, wrap = true }) {
  if (!to || !subject || !html) throw new Error("to, subject, html required");
  const finalHtml = wrap
    ? wrapEnvoyEmail({ title: subject, preheader: subject, bodyHtml: html })
    : html;
  return await sendMail({ to, subject, html: finalHtml });
}

/**
 * OTP / verification code email.
 * Used for new-account verification, password reset, and sensitive-action
 * confirmation. Big, legible code on a branded card.
 */
export async function sendOtpEmail({ to, name = "there", otp, minutes = 10, purpose = "verify your email" }) {
  const body = `
    <p style="margin:12px 0 0;font:15px/1.5 -apple-system,system-ui;color:#475569;" class="email-muted">
      Hi ${escapeHtml(name)},
    </p>
    <h1 style="margin:8px 0 16px;font:900 26px/1.2 -apple-system,system-ui,'Segoe UI',Arial,sans-serif;color:#0f172a;letter-spacing:-0.02em;">
      Here's your code.
    </h1>
    <p style="margin:0 0 20px;font:15px/1.6 -apple-system,system-ui;color:#475569;" class="email-muted">
      Use this one-time code to ${escapeHtml(purpose)}.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td align="center" style="padding:28px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:16px;">
          <div style="font:700 11px -apple-system,system-ui;color:${BRAND.darkColor};text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">
            Verification code
          </div>
          <div style="font:900 40px Monaco,'Courier New',monospace;color:#0f172a;letter-spacing:12px;">
            ${escapeHtml(String(otp))}
          </div>
          <div style="margin-top:10px;font:13px -apple-system,system-ui;color:#047857;">
            Expires in ${minutes} minutes
          </div>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font:13px/1.6 -apple-system,system-ui;color:#94a3b8;" class="email-muted">
      If you didn't request this code, you can safely ignore this email — nobody can do anything with it without your password.
    </p>
  `;
  const html = wrapEnvoyEmail({
    title: "Your Envoy verification code",
    preheader: `Code: ${otp} · expires in ${minutes} minutes`,
    bodyHtml: body,
  });
  return await sendMail({ to, subject: "Your Envoy verification code", html });
}

/**
 * Shipment status update email (legacy simple version).
 * Prefer buildShipmentUpdateEmail from mail/template.js for rich updates.
 */
export async function sendShipmentUpdateEmail({ to, trackingNumber, status, message, name = "there" }) {
  const statusLabel = String(status || "").replace(/_/g, " ");
  const body = `
    <p style="margin:12px 0 0;font:15px/1.5 -apple-system,system-ui;color:#475569;" class="email-muted">
      Hi ${escapeHtml(name)},
    </p>
    <h1 style="margin:8px 0 16px;font:900 24px/1.25 -apple-system,system-ui,'Segoe UI',Arial,sans-serif;color:#0f172a;">
      Shipment ${escapeHtml(trackingNumber)} — ${escapeHtml(statusLabel)}
    </h1>
    ${message ? `
      <div style="padding:16px 18px;background:#ecfdf5;border-left:4px solid ${BRAND.color};border-radius:8px;margin:16px 0;">
        <div style="font:15px/1.6 -apple-system,system-ui;color:#065f46;">${escapeHtml(message)}</div>
      </div>
    ` : ""}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
      <tr>
        <td>
          <a href="https://shipenvoy.com/track?ref=${encodeURIComponent(trackingNumber)}"
             style="display:inline-block;padding:14px 22px;border-radius:12px;background:${BRAND.color};color:#ffffff;font:700 15px -apple-system,system-ui;">
            Track your shipment →
          </a>
        </td>
      </tr>
    </table>
  `;
  const html = wrapEnvoyEmail({
    title: `Shipment ${trackingNumber} — ${statusLabel}`,
    preheader: message || `Status: ${statusLabel}`,
    bodyHtml: body,
  });
  return await sendMail({
    to,
    subject: `Shipment ${trackingNumber} · ${statusLabel}`,
    html,
  });
}

/**
 * Welcome email — sent on account creation.
 */
export async function sendWelcomeEmail({ to, name = "there" }) {
  const body = `
    <h1 style="margin:12px 0 16px;font:900 28px/1.2 -apple-system,system-ui;color:#0f172a;letter-spacing:-0.02em;">
      Welcome to Envoy, ${escapeHtml(name)}.
    </h1>
    <p style="margin:0 0 16px;font:16px/1.6 -apple-system,system-ui;color:#475569;">
      Your account is live. You can book your first shipment in about a minute — we've set aside a credit on us to cover it.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td>
          <a href="https://shipenvoy.com/services/express" style="display:inline-block;padding:14px 22px;border-radius:12px;background:${BRAND.color};color:#ffffff;font:700 15px -apple-system,system-ui;">
            Book your first shipment →
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:20px 0 0;font:14px/1.6 -apple-system,system-ui;color:#64748b;">
      Replies to this email go straight to our support team. We answer within 4 hours on business days.
    </p>
  `;
  const html = wrapEnvoyEmail({
    title: "Welcome to Envoy",
    preheader: "Your account is live — book your first shipment in a minute.",
    bodyHtml: body,
  });
  return await sendMail({ to, subject: "Welcome to Envoy", html });
}
