import { Router } from "express";
import protect from "../../shared/middleware/authMiddleware.js";
import { requireRole } from "../../shared/middleware/roleMiddleware.js";
import { maintenancePhotosUpload } from "../../shared/middleware/uploadMiddleware.js";
import { UserRole } from "../auth/type.js";
import * as controller from "./controller.js";

const router = Router();

router.use(protect);

// Tenant routes
router.get("/tenant/eligible-properties", requireRole(UserRole.TENANT), controller.getEligibleProperties);
router.post("/tenant/requests", requireRole(UserRole.TENANT), maintenancePhotosUpload, controller.createRequest);
router.get("/tenant/requests", requireRole(UserRole.TENANT), controller.getTenantRequests);

// Owner routes
router.get("/owner/summary", requireRole(UserRole.OWNER), controller.getOwnerSummary);
router.get("/owner/requests", requireRole(UserRole.OWNER), controller.getOwnerRequests);

// Shared / Role-checked detail & action routes
router.get("/:id", controller.getRequestDetails);
router.patch("/:id/status", controller.updateStatus);

export default router;
