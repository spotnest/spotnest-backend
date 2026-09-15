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

const uploadProfileImage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.file) throw new AppError(400, "No image uploaded — field name must be 'image'");
        const result = await authService.uploadProfileImage(req.user!.id, {
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
        });
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const uploadIdVerification = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.file) throw new AppError(400, "No file uploaded — field name must be 'idDocument'");
        const result = await authService.submitIdVerification(req.user!.id, {
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
        });
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const listPendingVerifications = async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const result = await authService.listPendingVerifications();
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const getIdDocumentUrl = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const result = await authService.getIdDocumentUrl(req.params.userId as string, req.user!.id);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const approveVerification = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const result = await authService.approveOwnerVerification(req.params.userId as string, req.user!.id);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const rejectVerification = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { reason } = rejectVerificationSchema.parse(req.body);
        const result = await authService.rejectOwnerVerification(req.params.userId as string, req.user!.id, reason);
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
    uploadProfileImage,
    uploadIdVerification,
    listPendingVerifications,
    getIdDocumentUrl,
    approveVerification,
    rejectVerification,
};
export default authController;