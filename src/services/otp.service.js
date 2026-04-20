// src/services/otp.service.js
import User from "../models/User.js";
import { sendOtpEmail } from "./email.service.js";

/** Generate a 6-digit OTP as string */
export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Set OTP on user, save, and send email (console in dev via mailer) */
export async function issueOtpForEmail(email, { minutes = 10 } = {}) {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User not found");

  const otp = generateOtp();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + minutes * 60 * 1000);
  await user.save();

  await sendOtpEmail({ to: email, name: user.name, otp, minutes });
  return { ok: true, otpPreview: process.env.NODE_ENV === "development" ? otp : undefined };
}

/** Verify OTP; clears otp fields on success (does NOT change role/login) */
export async function verifyOtpForEmail(email, otp) {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User not found");

  const now = new Date();
  const valid = user.otp && user.otpExpires && user.otp === otp && now <= user.otpExpires;
  if (!valid) return { ok: false };

  user.isVerified = true;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  return { ok: true, user };
}
