import { Router, type RequestHandler } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import { AppError } from "../../shared/errors/AppError.js";
import protect from "../../shared/middleware/authMiddleware.js";
import { requireRole } from "../../shared/middleware/roleMiddleware.js";
import { UserRole } from "../auth/type.js";
import chatController from "./controller.js";

const router = Router();

const requireApprovedOwnerForChat: RequestHandler = (request, _response, next) => {
    const user = (request as AuthRequest).user;
    if (user?.role === UserRole.OWNER && (!user.isVerified || user.verificationStatus !== "approved")) {
        return next(new AppError(403, "Only approved owners can use chat"));
    }
    next();
};

router.use(protect, requireRole(UserRole.USER, UserRole.TENANT, UserRole.OWNER), requireApprovedOwnerForChat);
router.post("/conversations", chatController.createConversation);
router.get("/conversations", chatController.listConversations);
router.get("/conversations/:conversationId/messages", chatController.listMessages);
router.post("/conversations/:conversationId/messages", chatController.sendMessage);
router.patch("/conversations/:conversationId/read", chatController.markMessagesRead);

export default router;
