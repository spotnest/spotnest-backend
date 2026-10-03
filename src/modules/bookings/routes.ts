import { Router } from "express";
import protect from "../../shared/middleware/authMiddleware.js";
import { requireRole } from "../../shared/middleware/roleMiddleware.js";
import { UserRole } from "../auth/type.js";
import * as bookingController from "./controller.js";

const router = Router();

router.post("/", protect, bookingController.createBooking);
router.get("/mine", protect, bookingController.listMyBookings);
router.get("/owner/requests", protect, requireRole(UserRole.OWNER), bookingController.listOwnerRequests);
router.patch("/:id/review", protect, requireRole(UserRole.OWNER), bookingController.reviewBooking);
router.get("/:id", protect, bookingController.getBooking);

export default router;
