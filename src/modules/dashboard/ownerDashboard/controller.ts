import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../../types/roleTypes.js";
import service from "./service.js";

export const getDashboard = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Scoped to the authenticated owner; no client-supplied owner id.
        const data = await service.getDashboard(req.user!.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
