// src/controllers/admin/user.controller.js
import User from "../../models/User.js";

/**
 * @route GET /api/admin/users
 * @desc List all registered users (admin only)
 */
export const listUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password -otp -otpExpires");
    return res.json(users);
  } catch (err) {
    console.error("❌ listUsers error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @route GET /api/admin/users/:id
 * @desc Get user by ID
 */
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -otp -otpExpires");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  } catch (err) {
    console.error("❌ getUserById error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @route PATCH /api/admin/users/:id
 * @desc Update user details (admin only)
 * body can include any editable field (name, email, phone, address, role, isVerified)
 */
export const updateUser = async (req, res) => {
  try {
    const allowed = ["name", "email", "phone", "address", "role", "isVerified"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    }).select("-password -otp -otpExpires");

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ message: "User updated", user });
  } catch (err) {
    console.error("❌ updateUser error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @route DELETE /api/admin/users/:id
 * @desc Delete a user account (admin only)
 */
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ message: "User deleted" });
  } catch (err) {
    console.error("❌ deleteUser error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
