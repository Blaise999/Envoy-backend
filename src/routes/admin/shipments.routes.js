// src/routes/admin/shipments.routes.js
import { Router } from "express";
import {
  listAllShipments,
  getShipmentById,
  updateShipment,
  notifyRecipient,
} from "../../controllers/admin/shipments.controller.js"; // <-- THIS path must exist
import { requireAuth } from "../../middleware/auth.js";

const router = Router();
router.use(requireAuth(["admin"]));

router.get("/", listAllShipments);
router.get("/:id", getShipmentById);
router.patch("/:id", updateShipment);
router.post("/:id/notify", notifyRecipient);

export default router;
