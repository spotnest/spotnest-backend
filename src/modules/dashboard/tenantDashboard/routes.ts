import { Router } from "express";
import protect from "../../../shared/middleware/authMiddleware.js";
import { requireRole } from "../../../shared/middleware/roleMiddleware.js";
import { UserRole } from "../../auth/type.js";
import * as controller from "./controller.js";

const router = Router();
router.use(protect, requireRole(UserRole.TENANT));
router.get("/dashboard", controller.getDashboard);
router.get("/rental", controller.getRental);
router.get("/payments", controller.getPayments);
router.get("/maintenance", controller.getMaintenance);
router.post("/maintenance", controller.createMaintenance);
export default router;
