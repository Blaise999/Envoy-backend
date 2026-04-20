// src/models/User.js
import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * User model
 * - Supports both normal users and admins
 * - Password stored as plaintext (⚠️ per your request, not secure)
 * - OTP fields for email verification
 * - lastToken can store the most recent issued JWT
 */
const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // ⚠️ plaintext as per your spec
    phone: { type: String, default: "" },
    address: { type: String, default: "" },

    role: { type: String, enum: ["user", "admin"], default: "user" },
    isVerified: { type: Boolean, default: false },

    // OTP for email verification
    otp: { type: String },
    otpExpires: { type: Date },

    // Store last issued JWT (for your “save token” requirement)
    lastToken: { type: String },

    // Admins may update users intricately
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default model("User", UserSchema);
