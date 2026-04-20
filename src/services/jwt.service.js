// src/services/jwt.service.js
import jwt from "jsonwebtoken";
import Token from "../models/Token.js";

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || "dev_secret";
const JWT_EXPIRES = process.env.JWT_ACCESS_EXPIRES || "7d";

/** Sign access token */
export function signAccessToken(payload, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES, ...opts });
}

/** Verify access token (throws on invalid) */
export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Persist a token (optional, for sessions/admin token saving) */
export async function saveToken({ userId, token, type = "access", expiresAt = null }) {
  if (!userId || !token) throw new Error("userId and token required");
  return await Token.create({ userId, token, type, expiresAt });
}

/** Invalidate a token (e.g., on logout) */
export async function revokeToken(token) {
  await Token.deleteOne({ token });
}

/** Revoke all tokens for a user (optional helper) */
export async function revokeAllForUser(userId) {
  await Token.deleteMany({ userId });
}
