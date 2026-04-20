// src/controllers/email.controller.js
import { sendMail } from "../config/mailer.js";

/**
 * @route POST /api/email/send
 * body: { to, subject, html }
 * - Sends a custom email via Resend (or console in dev)
 * - Useful for admin to send shipment updates / notifications
 */
export const sendEmail = async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    if (!to || !subject || !html) {
      return res.status(400).json({ message: "to, subject, and html are required" });
    }

    const result = await sendMail({ to, subject, html });

    if (!result.success) {
      return res.status(500).json({ message: "Failed to send email", error: result.error });
    }

    return res.json({ message: "Email sent successfully" });
  } catch (err) {
    console.error("❌ Email controller error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
