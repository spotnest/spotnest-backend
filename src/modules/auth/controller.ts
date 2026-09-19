import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import { AppError } from "../../shared/errors/AppError.js";
import authService from "./service.js";

import {
    loginSchema,
    refreshTokenSchema,
    signupSchema,
    verifyEmailSchema,
    resendVerificationSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    rejectVerificationSchema,
    updateProfileSchema,
    changePasswordSchema,
} from "./validation.js";

const isProduction = process.env.NODE_ENV === "production";

export const accessCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    maxAge: 15 * 60 * 1000,
    path: "/",
};

export const refreshCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
};

export const setAuthCookies = (
    res: Response,
    accessToken: string,
    refreshToken: string
): void => {
    res.cookie("accessToken", accessToken, accessCookieOptions);
    res.cookie("refreshToken", refreshToken, refreshCookieOptions);
};

export const clearAuthCookies = (res: Response): void => {
    res.clearCookie("accessToken", {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? ("none" as const) : ("lax" as const),
        path: "/",
    });

    res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? ("none" as const) : ("lax" as const),
        path: "/",
    });
};

const signup = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const data = signupSchema.parse(req.body);

        const result = await authService.register(data);

        res.status(201).json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

const login = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const data = loginSchema.parse(req.body);

        const result = await authService.login(data);

        setAuthCookies(
            res,
            result.token,
            result.refreshToken
        );

        res.status(200).json({
            success: true,
            data: {
                user: result.user,
            },
        });
    } catch (err) {
        next(err);
    }
};

const refresh = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const refreshToken = req.cookies?.refreshToken;

        if (!refreshToken) {
            throw new AppError(
                401,
                "No refresh token provided"
            );
        }

        const result = await authService.refresh({
            refreshToken,
        });

        setAuthCookies(
            res,
            result.token,
            result.refreshToken
        );

        res.status(200).json({
            success: true,
            data: {
                user: result.user,
            },
        });
    } catch (err) {
        next(err);
    }
};

const verifyEmail = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const data = verifyEmailSchema.parse(req.body);

        const result = await authService.verifyEmail(data);

        setAuthCookies(
            res,
            result.token,
            result.refreshToken
        );

        res.status(200).json({
            success: true,
            data: {
                user: result.user,
            },
        });
    } catch (err) {
        next(err);
    }
};

const resendVerification = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const data = resendVerificationSchema.parse(req.body);

        const result =
            await authService.resendVerification(data);

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

const forgotPassword = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const data = forgotPasswordSchema.parse(req.body);

        const result =
            await authService.forgotPassword(data);

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

const resetPassword = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const data = resetPasswordSchema.parse(req.body);

        const result =
            await authService.resetPassword(data);

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

const listUsers = async (
    _req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const result = await authService.listUsers();
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const logout = async (
    _req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        clearAuthCookies(res);

        res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    } catch (err) {
        next(err);
    }
};

const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const data = updateProfileSchema.parse(req.body);
        res.status(200).json({ success: true, data: await authService.updateProfile(req.user!.id, data as { name?: string; phone?: string }) });
    } catch (err) { next(err); }
};

const changePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const data = changePasswordSchema.parse(req.body);
        res.status(200).json({ success: true, data: await authService.changePassword(req.user!.id, data.currentPassword, data.newPassword) });
    } catch (err) { next(err); }
};

const uploadProfileImage = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.file) {
            throw new AppError(
                400,
                "No image uploaded — field name must be 'image'"
            );
        }

        const result =
            await authService.uploadProfileImage(
                req.user!.id,
                {
                    buffer: req.file.buffer,
                    mimetype: req.file.mimetype,
                }
            );

        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const uploadIdVerification = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.file) {
            throw new AppError(
                400,
                "No file uploaded — field name must be 'idDocument'"
            );
        }

        const result =
            await authService.submitIdVerification(
                req.user!.id,
                {
                    buffer: req.file.buffer,
                    mimetype: req.file.mimetype,
                }
            );

        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const listPendingVerifications = async (
    _req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const result =
            await authService.listPendingVerifications();

        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const getIdDocumentUrl = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const result =
            await authService.getIdDocumentUrl(
                req.params.userId as string,
                req.user!.id
            );

        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const approveVerification = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const result =
            await authService.approveOwnerVerification(
                req.params.userId as string,
                req.user!.id
            );

        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const rejectVerification = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const { reason } =
            rejectVerificationSchema.parse(req.body);

        const result =
            await authService.rejectOwnerVerification(
                req.params.userId as string,
                req.user!.id,
                reason
            );

        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const authController = {
    signup,
    login,
    refresh,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    listUsers,
    logout,
    updateProfile,
    changePassword,
    uploadProfileImage,
    uploadIdVerification,
    listPendingVerifications,
    getIdDocumentUrl,
    approveVerification,
    rejectVerification,
};

export default authController;