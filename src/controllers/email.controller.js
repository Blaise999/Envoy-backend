// src/controllers/email.controller.js
import { sendMail, SUPPORT_EMAIL } from "../config/mailer.js";

/**
 * Logo URL — uses LOGO_URL env, falls back to APP_URL/envoy.png.
 * APP_URL should be the frontend's domain (where /envoy.png is served from).
 */
function logoUrl() {
  return (
    process.env.LOGO_URL ||
    `${(process.env.APP_URL || "https://www.shipenvoy.com").replace(/\/+$/, "")}/envoy.png`
  );
}

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wrap a raw HTML / plain body in the Envoy email template if it doesn't
 * already look like a full HTML doc.
 */
function wrapEnvoyEmail({ subject, bodyHtml }) {
  // If the body already looks like a full HTML doc, pass it through
  // (the admin composer pre-wraps; we don't want to wrap twice).
  const looksWrapped = /^<!doctype|<html\b/i.test(String(bodyHtml || "").trim());
  if (looksWrapped) return bodyHtml;

  // Naive: if body has no tags, treat as plain text → paragraphs
  const isPlain = !/<[a-z][^>]*>/i.test(String(bodyHtml || ""));
  const innerHtml = isPlain
    ? `<p style="margin:0 0 12px;">${escapeHtml(bodyHtml).replace(/\n{2,}/g, '</p><p style="margin:0 0 12px;">').replace(/\n/g, "<br>")}</p>`
    : bodyHtml;

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>${escapeHtml(subject || "Envoy")}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,system-ui,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
          <tr>
            <td style="padding:24px 28px 20px;background:#ffffff;border-radius:16px 16px 0 0;">
              <img src="${logoUrl()}" alt="Envoy"
                   width="120" height="32"
                   style="display:block;border:0;outline:none;text-decoration:none;height:32px;width:auto;max-height:32px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;background:#ffffff;border-radius:0 0 16px 16px;">
              <div style="font:15px/1.6 -apple-system,system-ui;color:#334155;">
                ${innerHtml}
              </div>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 20px;">
              <p style="margin:0;font:12px/1.5 -apple-system,system-ui;color:#94a3b8;">
                <b style="color:#475569;">Envoy Logistics Ltd.</b> · 21 Wharf Road, London N1 7GS, UK<br>
                <a href="mailto:${SUPPORT_EMAIL}" style="color:#10b981;">${SUPPORT_EMAIL}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * @route POST /api/email/send
 * body: { to, subject, html, [text], [replyTo] }
 *
 * - Sends via Gmail SMTP (preferred) or Resend (fallback).
 * - If `html` is plain text or a fragment, it gets wrapped in the Envoy
 *   template automatically (logo, footer, brand).
 * - Reply-To always defaults to envoymailservices@gmail.com.
 */
export const sendEmail = async (req, res) => {
  try {
    const { to, subject, html, text, replyTo } = req.body || {};
    if (!to || !subject || !html) {
      return res.status(400).json({ message: "to, subject, and html are required" });
    }

    const finalHtml = wrapEnvoyEmail({ subject, bodyHtml: html });

    const result = await sendMail({
      to,
      subject,
      html: finalHtml,
      text,
      replyTo: replyTo || SUPPORT_EMAIL,
    });

    if (!result.success) {
      return res.status(500).json({ message: "Failed to send email", error: result.error });
    }

    return res.json({
      message: "Email sent successfully",
      via: result.via || (result.preview ? "preview" : "unknown"),
    });
  } catch (err) {
    console.error("❌ Email controller error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
