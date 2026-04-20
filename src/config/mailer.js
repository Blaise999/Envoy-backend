import { Resend } from "resend";

/**
 * Required env:
 * - RESEND_API_KEY=...
 * - EMAIL_FROM="Envoy Courier <noreply@shipenvoy.com>"
 * - NODE_ENV=development|production
 * - SEND_EMAILS=1   # set to "1" to actually send in development
 *
 * Behavior:
 * - If no RESEND_API_KEY → preview to console (safe).
 * - If NODE_ENV=development and SEND_EMAILS!="1" → preview to console.
 * - Otherwise send via Resend.
 */

let resendClient = null;
function getResend() {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

const shouldReallySend = () => {
  const dev = process.env.NODE_ENV === "development";
  if (dev && process.env.SEND_EMAILS !== "1") return false;
  return true;
};

function stripHtml(s = "") {
  return String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * sendMail({ to, subject, html, text, replyTo })
 */
export const sendMail = async ({ to, subject, html, text, replyTo }) => {
  const resend = getResend();

  // ✅ Make sure this is on your verified domain in Resend
  const from =
    process.env.EMAIL_FROM ||
    "Envoy Courier <noreply@shipenvoy.com>";

  // Safety/preview path
  if (!resend || !shouldReallySend()) {
    console.log("📧 [PREVIEW] Email (not actually sent)");
    console.log("From:", from);
    console.log("To:", to);
    console.log("Subject:", subject);
    if (replyTo) console.log("Reply-To:", replyTo);
    console.log("Text:", text || stripHtml(html || ""));
    console.log("HTML:", html);
    return { success: true, preview: true };
  }

  try {
    const payload = {
      from,
      to,
      subject,
      html: html || "",
      text: text || stripHtml(html || ""),
      ...(replyTo ? { reply_to: replyTo } : {}),
    };
    const response = await resend.emails.send(payload);
    return { success: true, response };
  } catch (err) {
    console.error("❌ Email send error:", err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
};
