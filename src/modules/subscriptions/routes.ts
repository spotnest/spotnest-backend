import { Router } from "express";

import * as subscriptionController from "./controller.js";

import protect from "../../shared/middleware/authMiddleware.js";

import { requireVerifiedOwner } from "../../shared/middleware/roleMiddleware.js";

const router = Router();


router.get("/plans", subscriptionController.listPlans);


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



export default router;
