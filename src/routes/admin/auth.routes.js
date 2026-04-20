import { Router } from "express";
import {
  adminRegister,
  adminLogin,
  adminMe,
  adminLogout,
} from "../../controllers/admin/admin.auth.controller.js";
import { requireAuth } from "../../middleware/auth.js";

const router = Router();

router.post("/register", adminRegister); // protect with invite code in controller
router.post("/login", adminLogin);
router.get("/me", requireAuth(["admin"]), adminMe);
router.post("/logout", requireAuth(["admin"]), adminLogout);

export default router;
