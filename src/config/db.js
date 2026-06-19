// src/config/db.js
import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const isProd = process.env.NODE_ENV === "production";

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Memory: the driver defaults to a pool of up to 100 connections, each
      // holding its own buffers. A hobby API needs only a handful. Capping the
      // pool dramatically lowers baseline and peak RSS on a 512 MB box.
      maxPoolSize: 5,
      minPoolSize: 0,

      // Don't rebuild every index (including the text index) on each boot.
      // Index builds spike memory/CPU at startup; create them once, not on
      // every restart. In dev we leave autoIndex on for convenience.
      autoIndex: !isProd,

      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1); // stop app if DB fails
  }
};
