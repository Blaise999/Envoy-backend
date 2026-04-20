// src/models/Token.js
import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

/**
 * Token model
 * - Links a token string to a user/admin
 * - Can be used for refresh tokens or session tracking
 * - Also works if you want to "save" the last issued token
 */
const TokenSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true },
    token: { type: String, required: true, index: true },
    type: { type: String, enum: ["access", "refresh", "admin"], default: "access" },
    expiresAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Optional: automatically delete expired tokens
TokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model("Token", TokenSchema);
