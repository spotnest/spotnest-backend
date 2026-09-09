import type { NextFunction, Request, Response } from "express";
import authService from "./service.js";
import { loginSchema, refreshTokenSchema, signupSchema } from "./validation.js";

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

const authController = { signup, login, refresh };
export default authController;
