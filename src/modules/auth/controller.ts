import type { NextFunction, Request, Response } from "express";
import authService from "./service.js";
import {
    loginSchema,
    refreshTokenSchema,
    signupSchema,
    verifyEmailSchema,
    resendVerificationSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
} from "./validation.js";

const signup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = signupSchema.parse(req.body);
        const result = await authService.register(data);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = loginSchema.parse(req.body);
        const result = await authService.login(data);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = refreshTokenSchema.parse(req.body);
        const result = await authService.refresh(data);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = verifyEmailSchema.parse(req.body);
        const result = await authService.verifyEmail(data);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const resendVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = resendVerificationSchema.parse(req.body);
        const result = await authService.resendVerification(data);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = forgotPasswordSchema.parse(req.body);
        const result = await authService.forgotPassword(data);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = resetPasswordSchema.parse(req.body);
        const result = await authService.resetPassword(data);
        res.status(200).json({ success: true, data: result });
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
};
export default authController;