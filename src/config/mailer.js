// src/config/mailer.js
//
// Two send paths, picked at runtime:
//
//   1. Gmail SMTP via nodemailer  (preferred when GMAIL_USER + GMAIL_APP_PASSWORD are set)
//        -> emails appear to actually come from envoymailservices@gmail.com
//        -> requires a Google App Password (not the account password)
//        -> https://support.google.com/accounts/answer/185833
//
//   2. Resend  (fallback — only when RESEND_API_KEY is set)
//        -> sends from a verified Resend domain
//        -> we set Reply-To to envoymailservices@gmail.com so replies still go to gmail
//
// If neither is configured, we log a preview to the console (safe in dev).
//
// Required env (.env):
//   # Gmail (preferred)
//   GMAIL_USER="envoymailservices@gmail.com"
//   GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"   # 16-char Google app password
//
//   # OR Resend
//   RESEND_API_KEY="re_..."
//   EMAIL_FROM="Envoy Courier <noreply@your-verified-domain>"
//
//   # Universal
//   SUPPORT_EMAIL="envoymailservices@gmail.com"
//   SEND_EMAILS=1                               # set to "1" to actually send in dev
//

import { Resend } from "resend";
import nodemailer from "nodemailer";

const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL || "envoymailservices@gmail.com";

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

/* ---------------- Gmail SMTP transport ---------------- */
let gmailTransport = null;
function getGmailTransport() {
  if (gmailTransport) return gmailTransport;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  gmailTransport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return gmailTransport;
}

/* ---------------- Resend transport ---------------- */
let resendClient = null;
function getResend() {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

/**
 * sendMail({ to, subject, html, text, replyTo })
 *
 * - Gmail path → from = "Envoy Support <envoymailservices@gmail.com>"
 * - Resend path → from = EMAIL_FROM (verified domain), Reply-To = SUPPORT_EMAIL
 */
export const sendMail = async ({ to, subject, html, text, replyTo }) => {
  const finalReplyTo = replyTo || SUPPORT_EMAIL;

  /* ---- DEV preview path ---- */
  if (!shouldReallySend()) {
    console.log("📧 [PREVIEW] Email (not actually sent — set SEND_EMAILS=1 to send)");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("Reply-To:", finalReplyTo);
    console.log("Text:", text || stripHtml(html || ""));
    return { success: true, preview: true };
  }

  /* ---- 1. Gmail path (preferred) ---- */
  const gmail = getGmailTransport();
  if (gmail) {
    const from = `Envoy Support <${process.env.GMAIL_USER}>`;
    try {
      const info = await gmail.sendMail({
        from,
        to,
        subject,
        html: html || "",
        text: text || stripHtml(html || ""),
        replyTo: finalReplyTo,
      });
      return { success: true, response: info, via: "gmail" };
    } catch (err) {
      console.error("❌ Gmail send error:", err?.message || err);
      // fall through to try Resend so we don't lose the email
    }
  }

  /* ---- 2. Resend path (fallback) ---- */
  const resend = getResend();
  if (resend) {
    const from =
      process.env.EMAIL_FROM ||
      "Envoy Courier <noreply@shipenvoy.com>";
    try {
      const payload = {
        from,
        to,
        subject,
        html: html || "",
        text: text || stripHtml(html || ""),
        reply_to: finalReplyTo,
      };
      const response = await resend.emails.send(payload);
      return { success: true, response, via: "resend" };
    } catch (err) {
      console.error("❌ Resend send error:", err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  /* ---- 3. No provider configured ---- */
  console.warn(
    "⚠ No email provider configured. Set GMAIL_USER+GMAIL_APP_PASSWORD or RESEND_API_KEY."
  );
  console.log("📧 [PREVIEW] To:", to, "Subject:", subject);
  return { success: true, preview: true, warning: "no_provider" };
};

export { SUPPORT_EMAIL };
