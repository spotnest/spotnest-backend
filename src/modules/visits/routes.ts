import { Router } from "express";

import protect from "../../shared/middleware/authMiddleware.js";
import * as visitController from "./controller.js";

const router = Router();

/**
 * =========================
 * USER VISIT REQUEST
 * =========================
 *
 * Any authenticated active user can
 * request a visit for an active property.
 *
 * The service determines:
 * - requester
 * - property owner
 * - visit status
 * - duplicate requests
 */
router.post(
    "/",
    protect,
    visitController.createVisit
);

export default router;