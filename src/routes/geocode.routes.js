import { Router } from "express";
import { geocode } from "../controllers/geocodecontroller.js"; // adjust path if yours differs

const router = Router();
router.get("/geocode", geocode);

export default router;            // <— default export
