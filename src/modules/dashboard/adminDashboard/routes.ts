import { Router } from "express";
import dashboardController from "./controller.js";
import protect from "../../../shared/middleware/authMiddleware.js";

const router = Router();

router.get("/admin", protect, dashboardController.getAdminDashboard);

export default router;
