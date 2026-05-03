// mail/template.js — Envoy shipment-update email template.
// Produces { subject, html, text } for the shipment lifecycle emails.

function sanitizeHtml(input = "") {
  if (!input) return "";
  let out = input
    .replace(/<\s*(script|style|iframe)[^>]*>[\s\S]*?<\s*\/\1\s*>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\son\w+=\S+/gi, "");
  const allowed = /<(\/)?(p|br|strong|b|em|i|u|a|ul|ol|li|span)\b([^>]*)>/gi;
  out = out
    .replace(/<[^>]+>/g, (m) => (m.match(allowed) ? m : ""))
    .replace(/<a\b([^>]*)>/gi, (m, attrs) => {
      const href = (attrs.match(/href=(".*?"|'.*?'|\S+)/i) || [, ""])[1];
      const cleanHref = String(href || "").replace(/javascript:/gi, "");
      return `<a href=${cleanHref} target="_blank" rel="noopener">`;
    });
  return out;
}

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdToHtml(md = "") {
  if (!md) return "";
  const safe = escapeHtml(md).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  return `<p>${safe}</p>`;
}

// Logo URL — uses LOGO_URL env var, falls back to /envoy.png at APP_URL.
// We use an <img> with width/height set so most email clients render it
// correctly. If the URL is unreachable for some recipient, the alt text
// shows "Envoy" so the email still looks branded.
function buildLogoBlock() {
  const appUrl = (process.env.APP_URL || "https://www.shipenvoy.com").replace(/\/+$/, "");
  const logoUrl = process.env.LOGO_URL || `${appUrl}/envoy.png`;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td style="vertical-align:middle;">
        <img src="${logoUrl}" alt="Envoy"
             width="120" height="32"
             style="display:block;border:0;outline:none;text-decoration:none;height:32px;width:auto;max-height:32px;" />
      </td>
    </tr>
  </table>`;
}
const INLINE_LOGO = buildLogoBlock();

// Human-friendly status words
const STATUS_LABELS = {
  CREATED: "Label created",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  ARRIVED: "Arrived at hub",
  DEPARTED: "Departed hub",
  CUSTOMS: "Clearing customs",
  CUSTOMS_HOLD: "Held by customs",
  CUSTOMS_RELEASED: "Customs cleared",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  EXCEPTION: "Needs attention",
  HELD: "On hold",
  RETURNED: "Returned to sender",
};

const STATUS_PCT = {
  CREATED: 10,
  PICKED_UP: 25,
  IN_TRANSIT: 50,
  ARRIVED: 60,
  DEPARTED: 65,
  CUSTOMS: 70,
  CUSTOMS_HOLD: 70,
  CUSTOMS_RELEASED: 75,
  OUT_FOR_DELIVERY: 88,
  DELIVERED: 100,
  EXCEPTION: 55,
  HELD: 50,
  RETURNED: 100,
};

export function buildShipmentUpdateEmail({
  brand = {
    name: "Envoy",
    color: "#10B981",
    darkColor: "#059669",
    supportEmail: process.env.SUPPORT_EMAIL || "envoymailservices@gmail.com",
    address: "Envoy Logistics, 21 Wharf Road, London N1 7GS, United Kingdom",
  },
  user = { firstName: "there", email: "user@example.com" },
  tracking = {
    id: "EV9876543210",
    status: "IN_TRANSIT",
    origin: "Paris, France",
    destination: "New York, USA",
    lastUpdate: "Apr 17, 06:45 GMT",
    eta: "Apr 25, 2026",
    url: "https://shipenvoy.com/track?ref=EV9876543210",
  },
  adminMessage = { html: "", markdown: "", text: "", title: "", placement: "after_progress" },
  preheader = "Your shipment has an update inside.",
} = {}) {
  const pct = STATUS_PCT[tracking.status] ?? 50;
  const statusLabel = STATUS_LABELS[tracking.status] || String(tracking.status || "").replace(/_/g, " ");

  // Admin content
  let adminHTML = "";
  if (adminMessage?.html) adminHTML = sanitizeHtml(adminMessage.html);
  else if (adminMessage?.markdown) adminHTML = sanitizeHtml(mdToHtml(adminMessage.markdown));
  else if (adminMessage?.text) adminHTML = `<p>${escapeHtml(adminMessage.text).replace(/\n/g, "<br>")}</p>`;

  const adminText =
    adminMessage?.text ||
    adminMessage?.markdown ||
    (adminHTML ? adminHTML.replace(/<[^>]+>/g, "").replace(/\s+\n/g, "\n") : "");

  const adminBlock = adminHTML
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
        <tr>
          <td style="padding:16px 18px;background:#ecfdf5;border-left:4px solid ${brand.color};border-radius:8px;">
            ${
              adminMessage?.title
                ? `<div style="font:700 11px -apple-system,system-ui,'Segoe UI',Arial,sans-serif;color:${brand.darkColor || brand.color};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">${escapeHtml(adminMessage.title)}</div>`
                : ""
            }
            <div style="font:15px/1.6 -apple-system,system-ui,'Segoe UI',Arial,sans-serif;color:#065f46;">
              ${adminHTML}
            </div>
          </td>
        </tr>
      </table>`
    : "";

  const subject = `${statusLabel} · ${tracking.id}`;

  const textParts = [
    `Hi ${user.firstName},`,
    ``,
    `Your shipment ${tracking.id} is now: ${statusLabel}.`,
    `Route: ${tracking.origin} → ${tracking.destination}`,
    tracking.eta ? `Estimated delivery: ${tracking.eta}` : null,
    tracking.lastUpdate ? `Last update: ${tracking.lastUpdate}` : null,
    ``,
    adminText ? `Note from Envoy:\n${adminText}\n` : null,
    `Track live: ${tracking.url}`,
    ``,
    `Thanks,`,
    `The Envoy team`,
    `— ${brand.supportEmail}`,
  ].filter(Boolean);
  const text = textParts.join("\n");

  const topBlock = adminMessage?.placement === "top" ? adminBlock : "";
  const afterProgressBlock = adminMessage?.placement === "after_progress" ? adminBlock : "";
  const beforeFooterBlock = adminMessage?.placement === "before_footer" ? adminBlock : "";

  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <meta name="x-preheader" content="${escapeHtml(preheader)}">
  <title>${escapeHtml(subject)}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .email-bg { background:#0f172a !important; }
      .email-card { background:#1e293b !important; color:#e2e8f0 !important; }
      .email-muted { color:#94a3b8 !important; }
      .email-divider { border-color:#334155 !important; }
      .email-info-card { background:#0f172a !important; }
    }
    a { text-decoration:none; }
    @media only screen and (max-width:600px) {
      .email-cta-row td { display:block !important; width:100% !important; }
      .email-cta-row td a { width:100% !important; text-align:center !important; box-sizing:border-box; }
      .email-cta-spacer { display:none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,system-ui,'Segoe UI',Arial,sans-serif;" class="email-bg">
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;" class="email-bg">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">

          <!-- ============ HEADER ============ -->
          <tr>
            <td style="padding:24px 28px 20px;background:#ffffff;border-radius:16px 16px 0 0;" class="email-card">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    ${INLINE_LOGO}
                  </td>
                  <td align="right" style="font:500 12px -apple-system,system-ui;color:#64748b;">
                    Shipment update
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============ GREETING + STATUS ============ -->
          <tr>
            <td style="background:#ffffff;padding:0 28px 8px;" class="email-card">
              <p style="margin:12px 0 0;font:15px/1.5 -apple-system,system-ui;color:#475569;" class="email-muted">
                Hi ${escapeHtml(user.firstName)},
              </p>
              <h1 style="margin:8px 0 16px;font:900 26px/1.2 -apple-system,system-ui,'Segoe UI',Arial,sans-serif;color:#0f172a;letter-spacing:-0.02em;">
                Your parcel is ${statusLabel.toLowerCase()}.
              </h1>

              ${topBlock}

              <!-- Tracking # chip + status pill -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
                <tr>
                  <td style="padding:6px 12px;background:#f1f5f9;border-radius:999px;font:600 12px -apple-system,system-ui,Monaco,monospace;color:#334155;letter-spacing:0.5px;">
                    ${escapeHtml(tracking.id)}
                  </td>
                  <td style="padding-left:8px;">
                    <span style="display:inline-block;padding:6px 12px;border-radius:999px;font:700 12px -apple-system,system-ui;background:${brand.color}1a;color:${brand.darkColor || brand.color};text-transform:uppercase;letter-spacing:0.5px;">
                      ${escapeHtml(statusLabel)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============ ROUTE + PROGRESS ============ -->
          <tr>
            <td style="background:#ffffff;padding:16px 28px 0;" class="email-card">
              <!-- Route -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;">
                <tr>
                  <td style="font:700 11px -apple-system,system-ui;color:#64748b;text-transform:uppercase;letter-spacing:1px;padding-bottom:6px;" class="email-muted">
                    From
                  </td>
                  <td></td>
                  <td align="right" style="font:700 11px -apple-system,system-ui;color:#64748b;text-transform:uppercase;letter-spacing:1px;padding-bottom:6px;" class="email-muted">
                    To
                  </td>
                </tr>
                <tr>
                  <td style="font:700 16px -apple-system,system-ui;color:#0f172a;">
                    ${escapeHtml(tracking.origin)}
                  </td>
                  <td align="center" style="width:40px;">
                    <span style="color:${brand.color};font:700 20px -apple-system,system-ui;">→</span>
                  </td>
                  <td align="right" style="font:700 16px -apple-system,system-ui;color:#0f172a;">
                    ${escapeHtml(tracking.destination)}
                  </td>
                </tr>
              </table>

              <!-- Progress bar -->
              <div style="height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin:16px 0 20px;">
                <div style="height:10px;width:${pct}%;background:linear-gradient(90deg,${brand.color},${brand.darkColor || brand.color});border-radius:999px;"></div>
              </div>

              ${afterProgressBlock}
            </td>
          </tr>

          <!-- ============ INFO CARDS ============ -->
          <tr>
            <td style="background:#ffffff;padding:0 28px 4px;" class="email-card">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:50%;padding:14px 16px;background:#f8fafc;border-radius:10px;" class="email-info-card">
                    <div style="font:700 11px -apple-system,system-ui;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;" class="email-muted">
                      Estimated delivery
                    </div>
                    <div style="font:800 18px -apple-system,system-ui;color:#0f172a;">
                      ${escapeHtml(tracking.eta || "Calculating")}
                    </div>
                  </td>
                  <td style="width:12px;"></td>
                  <td style="width:50%;padding:14px 16px;background:#f8fafc;border-radius:10px;" class="email-info-card">
                    <div style="font:700 11px -apple-system,system-ui;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;" class="email-muted">
                      Last update
                    </div>
                    <div style="font:800 14px -apple-system,system-ui;color:#0f172a;">
                      ${escapeHtml(tracking.lastUpdate || "Just now")}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============ CTA ============ -->
          <tr>
            <td style="background:#ffffff;padding:24px 28px 8px;" class="email-card">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-cta-row">
                <tr>
                  <td style="width:60%;">
                    <a href="${escapeHtml(tracking.url)}" style="display:block;padding:14px 20px;border-radius:12px;background:${brand.color};color:#ffffff;font:700 15px -apple-system,system-ui;text-align:center;box-shadow:0 2px 8px rgba(16,185,129,0.25);">
                      Track your shipment →
                    </a>
                  </td>
                  <td class="email-cta-spacer" style="width:12px;"></td>
                  <td style="width:40%;">
                    <a href="mailto:${escapeHtml(brand.supportEmail)}" style="display:block;padding:14px 20px;border-radius:12px;background:#f1f5f9;color:#0f172a;font:700 15px -apple-system,system-ui;text-align:center;">
                      Get help
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${beforeFooterBlock
            ? `<tr><td style="background:#ffffff;padding:0 28px;" class="email-card">${beforeFooterBlock}</td></tr>`
            : ""
          }

          <!-- ============ REASSURANCE LINE ============ -->
          <tr>
            <td style="background:#ffffff;padding:8px 28px 20px;" class="email-card">
              <p style="margin:8px 0 0;font:14px/1.6 -apple-system,system-ui;color:#64748b;" class="email-muted">
                We'll only email you when something meaningful changes. You can follow every scan live at the tracking link above.
              </p>
            </td>
          </tr>

          <!-- ============ FOOTER ============ -->
          <tr>
            <td style="background:#ffffff;padding:0 28px 28px;border-radius:0 0 16px 16px;" class="email-card">
              <hr class="email-divider" style="border:none;border-top:1px solid #e2e8f0;margin:8px 0 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font:13px/1.6 -apple-system,system-ui;color:#94a3b8;" class="email-muted">
                    <b style="color:#475569;">Envoy Logistics Ltd.</b><br>
                    ${escapeHtml(brand.address)}<br>
                    <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${brand.color};">${escapeHtml(brand.supportEmail)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;font:11px/1.6 -apple-system,system-ui;color:#94a3b8;" class="email-muted">
                You received this because a shipment is active on your Envoy account. Not you?
                <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${brand.color};">Let us know</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return { subject, html, text };
}
