import { Router } from "express";
import { getAdminDashboardData } from "./controller.js";

const router = Router();

router.get("/admin", getAdminDashboardData);

export default router;
