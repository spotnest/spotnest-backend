import { Router } from "express";
import protect from "../../shared/middleware/authMiddleware.js";
import { requireRole } from "../../shared/middleware/roleMiddleware.js";
import { UserRole } from "../auth/type.js";
import * as paymentController from "./controller.js";

const router = Router();

router.post("/advance/create-order", protect, paymentController.createAdvanceOrder);
router.post("/monthly/create-order", protect, paymentController.createMonthlyRentOrder);
router.post("/verify", protect, paymentController.verifyPayment);
router.post("/webhook", paymentController.webhook);

// Admin payments overview
router.get("/admin/all", protect, requireRole(UserRole.ADMIN), paymentController.getAdminPayments);

export default router;

