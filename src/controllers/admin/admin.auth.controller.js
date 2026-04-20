// src/controllers/admin/auth.controller.js
import jwt from "jsonwebtoken";
import User from "../../models/User.js";

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || "dev_secret";
const JWT_EXPIRES = process.env.JWT_ACCESS_EXPIRES || "7d";
const ADMIN_INVITE_CODE = process.env.ADMIN_INVITE_CODE || "let_me_in";

// helper: sign JWT
function makeToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: "admin", email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

/**
 * @route POST /api/admin/auth/register
 * body: { name, email, password, inviteCode }
 * - Creates an admin user (plaintext password per your instruction)
 * - Protected by ADMIN_INVITE_CODE to prevent random signups
 */
export const adminRegister = async (req, res) => {
  const { name, email, password, inviteCode } = req.body || {};
  if (!name || !email || !password || !inviteCode)
    return res.status(400).json({ message: "name, email, password, inviteCode required" });

  if (inviteCode !== ADMIN_INVITE_CODE)
    return res.status(403).json({ message: "Invalid invite code" });

  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: "Email already exists" });

  const admin = await User.create({
    name,
    email,
    password, // ⚠️ plaintext as requested
    role: "admin",
    isVerified: true, // admins considered verified by default
  });

  const token = makeToken(admin);
  admin.lastToken = token;
  await admin.save();

  return res.status(201).json({
    message: "Admin created",
    token,
    admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
  });
};

/**
 * @route POST /api/admin/auth/login
 * body: { email, password }
 * - Admin login, issues token and stores it
 */
export const adminLogin = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "email and password required" });

  const admin = await User.findOne({ email });
  if (!admin) return res.status(401).json({ message: "Invalid credentials" });
  if (admin.role !== "admin") return res.status(403).json({ message: "Not an admin account" });
  if (admin.password !== password) return res.status(401).json({ message: "Invalid credentials" });

  const token = makeToken(admin);
  admin.lastToken = token;
  await admin.save();

  return res.json({
    message: "Admin logged in",
    token,
    admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
  });
};

/**
 * @route GET /api/admin/auth/me
 * header: Authorization: Bearer <token>
 */
export const adminMe = async (req, res) => {
  const admin = await User.findById(req.user.sub).select("-password -otp -otpExpires");
  if (!admin) return res.status(404).json({ message: "Admin not found" });
  if (admin.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  return res.json(admin);
};

/**
 * @route POST /api/admin/auth/logout
 * - Clears stored token (optional)
 */
export const adminLogout = async (req, res) => {
  const admin = await User.findById(req.user.sub);
  if (admin && admin.role === "admin") {
    admin.lastToken = null;
    await admin.save();
  }
  return res.json({ message: "Admin logged out" });
};
