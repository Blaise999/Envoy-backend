import { Router } from "express";
import {
  register,
  verifyOtp,
  resendOtp,
  login,
  me,
  logout,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// public
router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/login", login);

// private
router.get("/me", requireAuth(), me);
router.post("/logout", requireAuth(), logout);


export default router;
