// src/controllers/user.controller.js
import User from "../models/User.js";

/**
 * @route GET /api/users/me
 * @desc Get my profile (requires auth)
 */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.sub).select("-password -otp -otpExpires -lastToken");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json(user);
  } catch (err) {
    console.error("❌ getMe error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @route PUT /api/users/me
 * @desc Update my profile (requires auth)
 * body: { name, phone, address, ... }
 */
export const updateMe = async (req, res) => {
  try {
    const allowed = ["name", "phone", "address"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const user = await User.findByIdAndUpdate(req.user.sub, updates, { new: true }).select(
      "-password -otp -otpExpires -lastToken"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ message: "Profile updated", user });
  } catch (err) {
    console.error("❌ updateMe error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @route DELETE /api/users/me
 * @desc Delete my account (requires auth)
 */
export const deleteMe = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.sub);
    return res.json({ message: "Account deleted" });
  } catch (err) {
    console.error("❌ deleteMe error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
