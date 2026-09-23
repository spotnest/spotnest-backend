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

export default router;