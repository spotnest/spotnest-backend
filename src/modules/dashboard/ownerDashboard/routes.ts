import { Router } from "express";
import protect from "../../../shared/middleware/authMiddleware.js";
import { requireRole } from "../../../shared/middleware/roleMiddleware.js";
import { UserRole } from "../../auth/type.js";
import * as controller from "./controller.js";

const router = Router();
router.use(protect, requireRole(UserRole.OWNER));
router.get("/dashboard", controller.getDashboard);
export default router;
