import { Router } from "express";
import protect from "../../shared/middleware/authMiddleware.js";
import { requireRole } from "../../shared/middleware/roleMiddleware.js";
import { UserRole } from "../auth/type.js";
import settingsController from "./controller.js";

const router = Router();

router.use(protect, requireRole(UserRole.ADMIN));
router.get("/", settingsController.getSettings);
router.patch("/", settingsController.updateSettings);

export default router;
