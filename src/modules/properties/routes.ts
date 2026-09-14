import { Router } from "express";
import protect from "../../shared/middleware/authMiddleware.js";
import { requireRole, requireVerifiedOwner } from "../../shared/middleware/roleMiddleware.js";
import { propertyImagesUpload } from "../../shared/middleware/uploadMiddleware.js";
import { UserRole } from "../auth/type.js";
import * as propertyController from "./controller.js";

const router = Router();

// Public
router.get("/", propertyController.listProperties);
router.get("/:id", propertyController.getProperty);

// Owner — creation requires an APPROVED, verified owner. This is the first
// real use of requireVerifiedOwner since it was built in the auth module.
router.post("/", protect, requireVerifiedOwner, propertyImagesUpload, propertyController.createProperty);
router.get("/mine/all", protect, requireRole(UserRole.OWNER), propertyController.listMyProperties);

// Owner (own listings only, enforced in service) or admin
router.patch("/:id", protect, requireRole(UserRole.OWNER, UserRole.ADMIN), propertyController.updateProperty);
router.patch("/:id/status", protect, requireRole(UserRole.OWNER, UserRole.ADMIN), propertyController.updateStatus);
router.post(
    "/:id/images",
    protect,
    requireRole(UserRole.OWNER, UserRole.ADMIN),
    propertyImagesUpload,
    propertyController.addImages
);
router.delete("/:id/images", protect, requireRole(UserRole.OWNER, UserRole.ADMIN), propertyController.removeImage);
router.delete("/:id", protect, requireRole(UserRole.OWNER, UserRole.ADMIN), propertyController.archiveProperty);

// Admin moderation
router.get("/admin/all", protect, requireRole(UserRole.ADMIN), propertyController.listAllForAdmin);

export default router;