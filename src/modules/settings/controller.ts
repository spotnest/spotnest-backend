import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import settingsService from "./service.js";
import { settingsUpdateSchema } from "./validation.js";

const getSettings = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        res.status(200).json({ success: true, data: await settingsService.getSettings() });
    } catch (err) {
        next(err);
    }
};

const updateSettings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = settingsUpdateSchema.parse(req.body);
        res.status(200).json({ success: true, data: await settingsService.updateSettings(data) });
    } catch (err) {
        next(err);
    }
};

export default { getSettings, updateSettings };
