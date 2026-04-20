// src/routes/admin.mock.routes.js
import { Router } from "express";
import {
  getMockBundle,
  injectMock,
  updateMockStats,
  addMockShipment,
  clearMock,
} from "../../controllers/admin/mock.controller.js";

// If you already have an admin auth middleware, uncomment this and mount it.
// import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

// --- tiny guard so we don't proceed with empty ids (no new deps) ---
function validateUserId(req, res, next) {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ message: "userId is required" });
  next();
}

// router.use(requireAdmin); // <-- enable when your admin auth is ready

router.get("/:userId", validateUserId, getMockBundle);
router.post("/:userId", validateUserId, injectMock);                // inject/merge bundle
router.patch("/:userId/stats", validateUserId, updateMockStats);    // tweak totals
router.post("/:userId/shipments", validateUserId, addMockShipment); // add one shipment
router.delete("/:userId", validateUserId, clearMock);               // clear overlay

export default router;
