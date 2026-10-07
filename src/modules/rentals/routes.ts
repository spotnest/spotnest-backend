import { Router } from "express";
import protect from "../../shared/middleware/authMiddleware.js";
import { requireRole } from "../../shared/middleware/roleMiddleware.js";
import { UserRole } from "../auth/type.js";
import controller from "./controller.js";

const router = Router();

// Tenant routes
router.get("/my-rental", protect, controller.getMyRental);
router.get("/agreements/my-agreement", protect, controller.getAgreement);
router.get("/agreements/:agreementId", protect, controller.getAgreement);
router.post("/agreements/:agreementId/accept", protect, controller.acceptAgreement);

// Owner routes
router.get("/owner/list", protect, requireRole(UserRole.OWNER), controller.getOwnerRentals);
router.post("/owner/:rentalId/split", protect, requireRole(UserRole.OWNER), controller.setRentSplit);
router.post("/owner/agreements/:agreementId/confirm", protect, requireRole(UserRole.OWNER), controller.confirmAgreement);
router.post("/owner/:rentalId/terminate", protect, requireRole(UserRole.OWNER), controller.terminateRental);

export default router;
