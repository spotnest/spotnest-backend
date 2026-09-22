import { Router } from "express";
import type { Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";

import protect from "../../shared/middleware/authMiddleware.js";
import { requireRole } from "../../shared/middleware/roleMiddleware.js";
import { authRateLimiter } from "../../shared/middleware/rateLimiter.js";
import {
    profileImageUpload,
    idDocumentUpload,
} from "../../shared/middleware/uploadMiddleware.js";

import { UserRole } from "./type.js";
import authController from "./controller.js";

import {
    googleAuth,
    googleCallback,
} from "./oauth/google.js";

const router = Router();

/**
 * =========================
 * PUBLIC AUTH ROUTES
 * =========================
 */

router.post(
    "/signup",
    authRateLimiter,
    authController.signup
);

router.post(
    "/login",
    authRateLimiter,
    authController.login
);

router.post(
    "/refresh",
    authController.refresh
);

router.post(
    "/verify-email",
    authRateLimiter,
    authController.verifyEmail
);

router.post(
    "/resend-verification",
    authRateLimiter,
    authController.resendVerification
);

router.post(
    "/forgot-password",
    authRateLimiter,
    authController.forgotPassword
);

router.post(
    "/reset-password",
    authRateLimiter,
    authController.resetPassword
);

router.post(
    "/logout",
    authController.logout
);

/**
 * =========================
 * CURRENT USER
 * =========================
 */

router.get(
    "/me",
    protect,
    (req: AuthRequest, res: Response) => {
        res.status(200).json({
            success: true,
            data: req.user,
        });
    }
);

router.patch("/me", protect, authController.updateProfile);
router.patch("/me/password", protect, authController.changePassword);
router.patch("/me/location", protect, authController.updateLocation);

/**
 * =========================
 * GOOGLE OAUTH
 * =========================
 */

router.get(
    "/google",
    googleAuth
);

router.get(
    "/google/callback",
    googleCallback
);

/**
 * =========================
 * PROFILE IMAGE
 * =========================
 */

router.patch(
    "/me/image",
    protect,
    profileImageUpload,
    authController.uploadProfileImage
);

/**
 * =========================
 * OWNER ID VERIFICATION
 * =========================
 */

router.post(
    "/owner/verification",
    protect,
    requireRole(UserRole.OWNER),
    idDocumentUpload,
    authController.uploadIdVerification
);

/**
 * =========================
 * ADMIN VERIFICATION
 * =========================
 */

router.get(
    "/admin/verifications",
    protect,
    requireRole(UserRole.ADMIN),
    authController.listPendingVerifications
);

router.get(
    "/admin/users",
    protect,
    requireRole(UserRole.ADMIN),
    authController.listUsers
);

router.get(
    "/admin/verifications/:userId/id-image",
    protect,
    requireRole(UserRole.ADMIN),
    authController.getIdDocumentUrl
);

router.patch(
    "/admin/verifications/:userId/approve",
    protect,
    requireRole(UserRole.ADMIN),
    authController.approveVerification
);

router.patch(
    "/admin/verifications/:userId/reject",
    protect,
    requireRole(UserRole.ADMIN),
    authController.rejectVerification
);

export default router;