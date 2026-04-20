import { Router } from "express";
import { sendEmail } from "../controllers/email.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Only admins can send arbitrary emails
router.post("/send", requireAuth(["admin"]), sendEmail);


export default router;
