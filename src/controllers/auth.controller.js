// src/controllers/auth.controller.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendMail } from "../config/mailer.js";

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || "dev_secret";
const JWT_EXPIRES = process.env.JWT_ACCESS_EXPIRES || "7d";

// helper: make JWT
function makeToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role || "user", email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// helper: 6-digit OTP
function makeOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * @route POST /api/auth/register
 * body: { name, email, password }
 * - saves user (unverified) to Mongo
 * - generates OTP, emails via Resend (or logs in dev)
 * - DOES NOT hash password (per your instruction)
 */
export const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ message: "name, email, password required" });

  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: "Email already registered" });

  const otp = makeOtp();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  const user = await User.create({
    name,
    email,
    password, // ⚠️ plaintext by request
    role: "user",
    isVerified: false,
    otp,
    otpExpires,
  });

  await sendMail({
    to: email,
    subject: "Your Envoy verification code",
    html: `<p>Hi ${name},</p><p>Your verification code is <b>${otp}</b>. It expires in 10 minutes.</p>`,
  });

  return res.status(201).json({
    message: "Registered. OTP sent (check email/console in dev).",
    userId: user._id,
  });
};

/**
 * @route POST /api/auth/verify-otp
 * body: { email, otp }
 * - verifies OTP, marks user verified
 * - issues JWT and (optionally) stores it on user
 */
export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: "email and otp required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });
  if (user.isVerified) return res.status(200).json({ message: "Already verified" });

  const now = new Date();
  if (!user.otp || !user.otpExpires || user.otp !== otp || now > user.otpExpires) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }

  user.isVerified = true;
  user.otp = undefined;
  user.otpExpires = undefined;

  const token = makeToken(user);
  user.lastToken = token; // optional “save token” as you requested
  await user.save();

  return res.json({
    message: "Verified",
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
};

/**
 * @route POST /api/auth/resend-otp
 * body: { email }
 */
export const resendOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "email required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });
  if (user.isVerified) return res.status(400).json({ message: "User already verified" });

  const otp = makeOtp();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  await sendMail({
    to: email,
    subject: "Your Envoy verification code (resend)",
    html: `<p>Your new verification code is <b>${otp}</b>. It expires in 10 minutes.</p>`,
  });

  return res.json({ message: "OTP resent" });
};

/**
 * @route POST /api/auth/login
 * body: { email, password }
 * - simple email/password match (plaintext by request)
 * - requires isVerified true (change if you want)
 * - returns JWT and saves lastToken
 */
export const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "email and password required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  if (user.password !== password)
    return res.status(401).json({ message: "Invalid credentials" });

  if (!user.isVerified)
    return res.status(403).json({ message: "Please verify your email first" });

  const token = makeToken(user);
  user.lastToken = token; // optional
  await user.save();

  return res.json({
    message: "Logged in",
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
};

/**
 * @route GET /api/auth/me
 * header: Authorization: Bearer <token>
 * - returns current user (requires auth middleware to set req.user)
 */
export const me = async (req, res) => {
  const user = await User.findById(req.user.sub).lean();
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isVerified: user.isVerified,
  });
};

/**
 * @route POST /api/auth/logout
 * - optional server-side token clear (since you're “saving” it)
 */
export const logout = async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (user) {
    user.lastToken = null;
    await user.save();
  }
  return res.json({ message: "Logged out" });
};
