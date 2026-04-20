// src/services/userLinker.js
import mongoose from "mongoose";
const User = mongoose.model("User");
import { normEmail, normPhone } from "../lib/identity.js";

/**
 * Find or create a lightweight user for this contact.
 * Returns a User doc (mongoose document).
 */
export async function findOrCreateUserForContact({ name, email, phone }) {
  const emailLower = normEmail(email);
  const phoneNorm  = normPhone(phone);

  let user = null;

  if (emailLower) {
    user = await User.findOne({ emailLower });
  }
  if (!user && phoneNorm) {
    user = await User.findOne({ "phones.normalized": phoneNorm });
  }

  if (user) return user;

  // Create a lightweight “prospect/guest” user
  user = await User.create({
    name: name || (emailLower ? emailLower.split("@")[0] : "Guest"),
    email: emailLower || undefined,
    emailLower: emailLower || undefined,
    phones: phoneNorm ? [{ raw: phone, normalized: phoneNorm }] : [],
    roles: ["prospect"],       // add this role to your enum if you use one
    status: "guest",           // optional: "guest" | "active"
    // no password; they can claim the account later via magic link/OTP
  });

  return user;
}
