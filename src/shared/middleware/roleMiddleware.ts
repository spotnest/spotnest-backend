import type { NextFunction, Response } from "express";

import type { AuthRequest } from "../../types/roleTypes.js";

import { AppError } from "../errors/AppError.js";

import { UserRole } from "../../modules/auth/type.js";

/**
 * Require one of the specified roles.
 */
export const requireRole = (...roles: UserRole[]) => {
    return (
        req: AuthRequest,
        _res: Response,
        next: NextFunction
    ) => {
        if (
            !req.user ||
            !roles.includes(req.user.role as UserRole)
        ) {
            return next(
                new AppError(
                    403,
                    "Insufficient permissions"
                )
            );
        }

        next();
    };
};

/**
 * Require an approved owner.
 *
 * isVerified = email verification
 * verificationStatus = owner document/admin approval
 */
export const requireVerifiedOwner = (
    req: AuthRequest,
    _res: Response,
    next: NextFunction
) => {
    if (
        !req.user ||
        req.user.role !== UserRole.OWNER
    ) {
        return next(
            new AppError(
                403,
                "Only property owners can perform this action"
            )
        );
    }

    if (
        req.user.verificationStatus !== "approved"
    ) {
        return next(
            new AppError(
                403,
                "Your ID verification must be approved before managing properties"
            )
        );
    }

    next();
};

/**
 * Require either:
 *
 * - ADMIN
 * - APPROVED OWNER
 *
 * This middleware is used for property-management
 * operations where admins can manage any property
 * and approved owners can manage their own properties.
 *
 * IMPORTANT:
 * This middleware only checks the user's role and
 * owner verification status.
 *
 * Property ownership must still be checked inside
 * the property service/controller.
 */
export const requireOwnerOrAdmin = (
    req: AuthRequest,
    _res: Response,
    next: NextFunction
) => {
    if (!req.user) {
        return next(
            new AppError(
                401,
                "Authentication required"
            )
        );
    }

    /**
     * Admins can manage properties.
     */
    if (req.user.role === UserRole.ADMIN) {
        return next();
    }

    /**
     * Only approved owners can manage properties.
     */
    if (
        req.user.role === UserRole.OWNER &&
        req.user.verificationStatus === "approved"
    ) {
        return next();
    }

    return next(
        new AppError(
            403,
            "Your ID verification must be approved before managing properties"
        )
    );
};