// src/routes/dev.routes.js
import { Router } from "express";
import { sendMail } from "../config/mailer.js";

const r = Router();

r.get("/test-mail", async (req, res) => {
  try {
    const to = req.query.to || "delivered@resend.dev"; // use your email to test inbox
    const out = await sendMail({
      to,
      subject: "Resend smoke test",
      html: "<p>it works!</p>",
      text: "it works!",
      replyTo: process.env.EMAIL_REPLY_TO,
    });
    res.json({ ok: true, out });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

export default r;
