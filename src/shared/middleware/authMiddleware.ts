import type {
    NextFunction,
    Response,
} from "express";

import {
    UserRole,
    UserStatus,
} from "../../modules/auth/type.js";

import authRepository from "../../modules/auth/repository.js";

import {
    verifyToken,
} from "../utils/token.js";

import type {
    AuthRequest,
} from "../../types/roleTypes.js";

/**
 * =========================
 * PROTECT
 * =========================
 *
 * Verifies the access token and loads
 * the current user from the database.
 */
const protect = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const authorization =
            req.headers.authorization;

        if (
            !authorization ||
            !authorization.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const token =
            authorization.substring(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        let payload;

        try {
            payload = verifyToken(token);

            if (payload.type !== "access") {
                return res.status(401).json({
                    success: false,
                    message: "Invalid access token",
                });
            }
        } catch {
            return res.status(401).json({
                success: false,
                message:
                    "Invalid or expired access token",
            });
        }

        const user =
            await authRepository.findById(
                payload.userId
            );

        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "User no longer exists",
            });
        }

        if (
            user.isBlock ||
            user.status !== UserStatus.ACTIVE
        ) {
            return res.status(403).json({
                success: false,
                message: "Account is not active",
            });
        }

        /**
         * Always use the current database state.
         *
         * This is important for owner approval:
         * if an admin rejects or approves an owner,
         * the middleware sees the latest status.
         */
req.user = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions ?? [],
    isVerified: user.isVerified,
    isBlock: user.isBlock,

    ...(user.verificationStatus
        ? {
              verificationStatus:
                  user.verificationStatus,
          }
        : {}),

    ...(user.phone
        ? { phone: user.phone }
        : {}),

    ...(user.image
        ? { image: user.image }
        : {}),

    ...(user.locationName
        ? {
              locationName:
                  user.locationName,
          }
        : {}),

    ...(user.locationResolvedName
        ? {
              locationResolvedName:
                  user.locationResolvedName,
          }
        : {}),
};

        return next();
    } catch (error) {
        return next(error);
    }
};

/**
 * =========================
 * REQUIRE ROLE
 * =========================
 *
 * Allows only the specified roles.
 */
export const requireRole =
    (...roles: UserRole[]) =>
    (
        req: AuthRequest,
        res: Response,
        next: NextFunction
    ) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message:
                    "Authentication required",
            });
        }

        if (
            !roles.includes(
                req.user.role as UserRole
            )
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to access this resource",
            });
        }

        return next();
    };

/**
 * =========================
 * REQUIRE VERIFIED OWNER
 * =========================
 *
 * Required for owner-only operations.
 *
 * Owner must:
 * 1. Be authenticated
 * 2. Have role OWNER
 * 3. Have verified email
 * 4. Have approved owner verification
 */
export const requireVerifiedOwner = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Authentication required",
        });
    }

    if (req.user.role !== UserRole.OWNER) {
        return res.status(403).json({
            success: false,
            message:
                "Only property owners can access this resource",
        });
    }

    /**
     * Email verification and owner approval
     * are separate states.
     */
    if (!req.user.isVerified) {
        return res.status(403).json({
            success: false,
            message:
                "Please verify your email before accessing owner features",
        });
    }

    if (
        req.user.verificationStatus !==
        "approved"
    ) {
        switch (
            req.user.verificationStatus
        ) {
            case "pending":
                return res.status(403).json({
                    success: false,
                    message:
                        "Your owner account is pending admin approval",
                });

            case "rejected":
                return res.status(403).json({
                    success: false,
                    message:
                        "Your owner verification was rejected",
                });

            case "unsubmitted":
            default:
                return res.status(403).json({
                    success: false,
                    message:
                        "Please submit your owner certification for admin approval",
                });
        }
    }

    return next();
};

/**
 * =========================
 * OWNER OR ADMIN
 * =========================
 *
 * Allows:
 *
 * ADMIN
 *   -> always allowed
 *
 * APPROVED OWNER
 *   -> allowed
 *
 * NORMAL USER
 *   -> blocked
 *
 * Property ownership itself must still
 * be checked by the property service.
 */
export const requireOwnerOrAdmin = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Authentication required",
        });
    }

    /**
     * Admin can manage any property.
     */
    if (req.user.role === UserRole.ADMIN) {
        return next();
    }

    /**
     * Everyone else must be an owner.
     */
    if (req.user.role !== UserRole.OWNER) {
        return res.status(403).json({
            success: false,
            message:
                "Only owners or administrators can access this resource",
        });
    }

    /**
     * Owner must have verified email.
     */
    if (!req.user.isVerified) {
        return res.status(403).json({
            success: false,
            message:
                "Please verify your email before accessing owner features",
        });
    }

    /**
     * Owner must be approved.
     */
    if (
        req.user.verificationStatus !==
        "approved"
    ) {
        switch (
            req.user.verificationStatus
        ) {
            case "pending":
                return res.status(403).json({
                    success: false,
                    message:
                        "Your owner account is pending admin approval",
                });

            case "rejected":
                return res.status(403).json({
                    success: false,
                    message:
                        "Your owner verification was rejected",
                });

            case "unsubmitted":
            default:
                return res.status(403).json({
                    success: false,
                    message:
                        "Please submit your owner certification for admin approval",
                });
        }
    }

    return next();
};

/**
 * Default export is required by existing
 * auth, settings, and admin route files.
 */
export default protect;