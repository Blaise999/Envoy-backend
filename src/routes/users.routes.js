// src/routes/users.routes.js
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js"; // adjust path to your auth middleware
import UserDetails from "../models/userDetails.model.js"; // ESM default export

const router = Router();

/* ... your existing routes ... */

// GET /api/users/me/details  -> returns (and if missing, creates) the embedded dashboard doc
router.get("/me/details", requireAuth, async (req, res, next) => {
  try {
    const userId =
      req.user?.id ||
      req.user?._id ||
      req.auth?.userId ||
      req.auth?.id;

    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    let doc = await UserDetails.findOne({ user: userId });
    if (!doc) {
      doc = await UserDetails.create({ user: userId });
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

export default router;













