import { Router } from "express";
import protect from "../../shared/middleware/authMiddleware.js";
import notificationController from "./controller.js";

const router = Router();

router.use(protect);
router.get("/", notificationController.listNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);

export default router;
