import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import { AppError } from "../errors/AppError.js";
import { UserRole } from "../../modules/auth/type.js";

export const requireRole = (...roles: UserRole[]) => {
    return (req: AuthRequest, _res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role as UserRole)) {
            return next(new AppError(403, "Insufficient permissions"));
        }
        next();
    };
};


export const requireVerifiedOwner = (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== UserRole.OWNER) {
        return next(new AppError(403, "Only property owners can perform this action"));
    }
    if (req.user.verificationStatus !== "approved") {
        return next(new AppError(403, "Your ID verification must be approved before listing properties"));
    }
    next();
};