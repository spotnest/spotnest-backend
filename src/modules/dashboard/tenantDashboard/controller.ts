import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../../types/roleTypes.js";
import service from "./service.js";
import { createMaintenanceSchema } from "./validation.js";

const respond = (handler: (tenantId: string) => Promise<unknown>) =>
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try { res.status(200).json(await handler(req.user!.id)); }
        catch (error) { next(error); }
    };
export const getDashboard = respond(service.getDashboard);
export const getRental = respond(service.getRental);
export const getPayments = respond(service.getPayments);
export const getMaintenance = respond(service.getMaintenance);
export const createMaintenance = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const request = await service.createMaintenance(req.user!.id, createMaintenanceSchema.parse(req.body));
        res.status(201).json(request);
    }
    catch (error) { next(error); }
};
