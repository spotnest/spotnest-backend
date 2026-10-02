import { Router } from "express";

import protect from "../../shared/middleware/authMiddleware.js";
import { requireVerifiedOwner } from "../../shared/middleware/roleMiddleware.js";
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