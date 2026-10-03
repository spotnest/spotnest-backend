import { Router } from "express";

import protect from "../../shared/middleware/authMiddleware.js";
import {
    requireRole,
    requireVerifiedOwner,
} from "../../shared/middleware/roleMiddleware.js";
import { UserRole } from "../auth/type.js";
import * as visitController from "./controller.js";

const router = Router();

/**
 * =========================
 * USER VISIT REQUEST
 * =========================
 */

router.post(
    "/",
    protect,
    visitController.createVisit
);

/**
 * =========================
 * USER VISITS
 * =========================
 *
 * Must come before /:id
 * so "my" is not treated as a visit ID.
 */

router.get(
    "/my",
    protect,
    visitController.getMyVisits
);

router.get(
    "/owner",
    protect,
    requireVerifiedOwner,
    visitController.getOwnerVisits
);

/**
 * =========================
 * ADMIN VISITS
 * =========================
 *
 * Must come before /:id
 * so "admin" is not treated as a visit ID.
 *
 * Admin can monitor all visit requests.
 * Admin does not manage visit status here.
 */

router.get(
    "/admin",
    protect,
    requireRole(UserRole.ADMIN),
    visitController.getAdminVisits
);

/**
 * =========================
 * SINGLE VISIT
 * =========================
 */

router.get(
    "/:id",
    protect,
    visitController.getVisitById
);

/**
 * =========================
 * OWNER ACTIONS
 * =========================
 */

router.patch(
    "/:id/accept",
    protect,
    requireVerifiedOwner,
    visitController.acceptVisit
);

router.patch(
    "/:id/reject",
    protect,
    requireVerifiedOwner,
    visitController.rejectVisit
);

router.patch(
    "/:id/reschedule",
    protect,
    requireVerifiedOwner,
    visitController.rescheduleVisit
);

router.patch(
    "/:id/complete",
    protect,
    requireVerifiedOwner,
    visitController.completeVisit
);

/**
 * =========================
 * CANCEL VISIT
 * =========================
 *
 * Either the requester or the owner
 * can cancel. The service performs
 * the ownership check.
 */

router.patch(
    "/:id/cancel",
    protect,
    visitController.cancelVisit
);

export default router;