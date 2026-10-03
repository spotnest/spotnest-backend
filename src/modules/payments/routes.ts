import { Router } from "express";
import protect from "../../shared/middleware/authMiddleware.js";
import * as paymentController from "./controller.js";

const router = Router();

router.post("/advance/create-order", protect, paymentController.createAdvanceOrder);
router.post("/monthly/create-order", protect, paymentController.createMonthlyRentOrder);
router.post("/verify", protect, paymentController.verifyPayment);
router.post("/webhook", paymentController.webhook);

export default router;
