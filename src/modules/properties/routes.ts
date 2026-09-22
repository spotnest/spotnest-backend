import { Router } from "express";

import protect from "../../shared/middleware/authMiddleware.js";

import {
    requireRole,
    requireVerifiedOwner,
    requireOwnerOrAdmin,
} from "../../shared/middleware/roleMiddleware.js";

import { propertyImagesUpload } from "../../shared/middleware/uploadMiddleware.js";

import { UserRole } from "../auth/type.js";

import * as propertyController from "./controller.js";

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

router.post(
    "/:id/images",
    protect,
    requireOwnerOrAdmin,
    propertyImagesUpload,
    propertyController.addImages
);

router.delete(
    "/:id/images",
    protect,
    requireOwnerOrAdmin,
    propertyController.removeImage
);

router.delete(
    "/:id",
    protect,
    requireOwnerOrAdmin,
    propertyController.archiveProperty
);

export default router;