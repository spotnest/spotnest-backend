import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import dashboardService from "./services.js";

const getAdminDashboard = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (req.user?.role !== "admin") {
            res.status(403).json({ success: false, message: "Admin access required" });
            return;
        }

        const data = await dashboardService.getAdminDashboard();
        res.status(200).json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

export default { getAdminDashboard };
