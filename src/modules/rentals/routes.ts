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
router.get("/owner/terms", protect, requireRole(UserRole.OWNER), controller.getOwnerRentalTerms);
router.put("/owner/terms", protect, requireRole(UserRole.OWNER), controller.updateOwnerRentalTerms);

// Owner agreement management routes
router.get("/owner/agreements", protect, requireRole(UserRole.OWNER), controller.listOwnerAgreements);
router.post("/owner/agreements/manual", protect, requireRole(UserRole.OWNER), controller.createManualAgreement);
router.get("/owner/agreements/:agreementId", protect, requireRole(UserRole.OWNER), controller.getOwnerAgreement);
router.put("/owner/agreements/:agreementId", protect, requireRole(UserRole.OWNER), controller.updateAgreement);
router.delete("/owner/agreements/:agreementId", protect, requireRole(UserRole.OWNER), controller.deleteOrCancelAgreement);
router.post("/owner/agreements/:agreementId/resend", protect, requireRole(UserRole.OWNER), controller.resendAgreement);
router.get("/owner/tenants/lookup", protect, requireRole(UserRole.OWNER), controller.lookupTenant);
export default router;
