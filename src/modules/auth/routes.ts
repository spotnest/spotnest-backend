import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import protect from "../../shared/middleware/authMiddleware.js";
import { requireRole } from "../../shared/middleware/roleMiddleware.js";
import { profileImageUpload, idDocumentUpload } from "../../shared/middleware/uploadMiddleware.js";
import { UserRole } from "./type.js";
import authController from "./controller.js";

const router = Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/verify-email", authController.verifyEmail);
router.post("/resend-verification", authController.resendVerification);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/me", protect, (req: AuthRequest, res: Response) => {
    res.status(200).json({ success: true, data: req.user });
});

// Profile picture — any authenticated user, own account only
router.patch("/me/image", protect, profileImageUpload, authController.uploadProfileImage);

// Owner ID verification
router.post("/owner/verification", protect, requireRole(UserRole.OWNER), idDocumentUpload, authController.uploadIdVerification);

// Admin review
router.get("/admin/verifications", protect, requireRole(UserRole.ADMIN), authController.listPendingVerifications);
router.get("/admin/verifications/:userId/id-image", protect, requireRole(UserRole.ADMIN), authController.getIdDocumentUrl);
router.patch("/admin/verifications/:userId/approve", protect, requireRole(UserRole.ADMIN), authController.approveVerification);
router.patch("/admin/verifications/:userId/reject", protect, requireRole(UserRole.ADMIN), authController.rejectVerification);

const authRoutes = router;
export default authRoutes;