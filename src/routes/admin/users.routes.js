import { Router } from "express";
import {
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
} from "../../controllers/admin/admin.user.controller.js";
import { requireAuth } from "../../middleware/auth.js";

const router = Router();

router.use(requireAuth(["admin"])); // all below require admin

router.get("/", listUsers);
router.get("/:id", getUserById);
router.patch("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
