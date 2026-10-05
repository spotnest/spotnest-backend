import { Router } from "express";

import * as subscriptionController from "./controller.js";

import protect from "../../shared/middleware/authMiddleware.js";

import { requireVerifiedOwner } from "../../shared/middleware/roleMiddleware.js";

const router = Router();

/**
 * =========================
 * PLANS
 * =========================
 *
 * Public so the pricing page renders for signed-out visitors.
 */
router.get("/plans", subscriptionController.listPlans);

/**
 * =========================
 * OWNER SUBSCRIPTION
 * =========================
 *
 * requireVerifiedOwner blocks tenants, users and admins: it requires
 * role === owner AND a verified email AND an approved owner verification.
 */
router.get("/me", protect, requireVerifiedOwner, subscriptionController.getMySubscription);

router.post(
    "/checkout",
    protect,
    requireVerifiedOwner,
    subscriptionController.createCheckout
);

router.post(
    "/verify",
    protect,
    requireVerifiedOwner,
    subscriptionController.verifyCheckout
);

/**
 * /webhook is NOT declared here.
 *
 * It must be mounted ahead of express.json() in app.ts so the raw body is
 * preserved for signature verification.
 */

export default router;
