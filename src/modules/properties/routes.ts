import { Router } from "express";

import * as propertyController from "./controller.js";

import { propertyImagesUpload } from "../../shared/middleware/uploadMiddleware.js";
import protect from "../../shared/middleware/authMiddleware.js";

import {
    requireRole,
    requireVerifiedOwner,
    requireOwnerOrAdmin,
} from "../../shared/middleware/roleMiddleware.js";

import { UserRole } from "../auth/type.js";

const router = Router();

/**
 * =========================
 * OWNER PROPERTY LIST
 * =========================
 *
 * Only an approved owner can access
 * their own property listings.
 *
 * IMPORTANT:
 * This route must be before /:id.
 */
router.get(
    "/mine/all",
    protect,
    requireVerifiedOwner,
    propertyController.listMyProperties
);

/**
 * Get a single property owned by the current owner.
 *
 * Declared AFTER /mine/all so the literal "all" is never
 * captured by the :id param.
 */
router.get(
    "/mine/:id",
    protect,
    requireVerifiedOwner,
    propertyController.getMyProperty
);

/**
 * =========================
 * ADMIN MANAGEMENT
 * =========================
 *
 * These routes must be declared before
 * the public /:id route.
 */

router.get(
    "/admin/all",
    protect,
    requireRole(UserRole.ADMIN),
    propertyController.listAllForAdmin
);

router.get(
    "/admin/:id",
    protect,
    requireRole(UserRole.ADMIN),
    propertyController.getAdminProperty
);

/**
 * =========================
 * PUBLIC
 * =========================
 */

router.get(
    "/",
    propertyController.listProperties
);

/**
 * MUST be before /:id.
 *
 * Otherwise Express can interpret
 * "nearby" as a property ID.
 */
router.get(
    "/nearby",
    protect,
    propertyController.listNearby
);

router.get(
    "/:id",
    propertyController.getProperty
);

/**
 * =========================
 * OWNER CREATE PROPERTY
 * =========================
 *
 * Only an APPROVED owner can create
 * a property.
 */

router.post(
    "/",
    protect,
    requireVerifiedOwner,
    propertyImagesUpload,
    propertyController.createProperty
);

/**
 * =========================
 * PROPERTY MANAGEMENT
 * =========================
 *
 * ADMIN:
 *   Allowed.
 *
 * APPROVED OWNER:
 *   Allowed, subject to ownership
 *   validation inside the service.
 *
 * PENDING / REJECTED OWNER:
 *   Blocked.
 *
 * NORMAL USER:
 *   Blocked.
 */

router.patch(
    "/:id",
    protect,
    requireOwnerOrAdmin,
    propertyController.updateProperty
);

router.patch(
    "/:id/status",
    protect,
    requireOwnerOrAdmin,
    propertyController.updateStatus
);

router.delete(
    "/:id",
    protect,
    requireOwnerOrAdmin,
    propertyController.archiveProperty
);

/**
 * =========================
 * PROPERTY IMAGES
 * =========================
 */

router.post(
    "/:id/images",
    protect,
    requireOwnerOrAdmin,
    propertyImagesUpload,
    propertyController.addImages
);

router.post(
    "/:id/images/remove",
    protect,
    requireOwnerOrAdmin,
    propertyController.removeImage
);

export default router;