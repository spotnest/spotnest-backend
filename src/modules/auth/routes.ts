import { Router } from "express";
import type { Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";

import protect from "../../shared/middleware/authMiddleware.js";
import authController from "./controller.js";
import {
    googleAuth,
    googleCallback,
} from "./oauth/google.js";

const router = Router();

router.post(
    "/signup",
    authController.signup
);

router.post(
    "/login",
    authController.login
);

router.post(
    "/refresh",
    authController.refresh
);

router.post(
    "/verify-email",
    authController.verifyEmail
);

router.post(
    "/resend-verification",
    authController.resendVerification
);

router.post(
    "/forgot-password",
    authController.forgotPassword
);

router.post(
    "/reset-password",
    authController.resetPassword
);

/**
 * Get current authenticated user
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

/**
 * Google OAuth
 */
router.get(
    "/google",
    googleAuth
);

router.get(
    "/google/callback",
    googleCallback
);

const authRoutes = router;

export default authRoutes;