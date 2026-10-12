import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import service from "./service.js";
import { createMaintenanceSchema, listMaintenanceQuerySchema, updateStatusSchema } from "./validation.js";

export const getEligibleProperties = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id;
        const properties = await service.getEligibleProperties(userId);
        res.status(200).json(properties);
    } catch (error) {
        next(error);
    }
};

export const createRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id;
        const validated = createMaintenanceSchema.parse(req.body);
        const files = req.files as Express.Multer.File[] | undefined;
        const request = await service.createRequest(userId, validated, files);
        res.status(201).json(request);
    } catch (error) {
        next(error);
    }
};

export const getTenantRequests = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id;
        const query = listMaintenanceQuerySchema.parse(req.query);
        const result = await service.getTenantRequests(userId, query);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

export const getOwnerRequests = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id;
        const query = listMaintenanceQuerySchema.parse(req.query);
        const result = await service.getOwnerRequests(userId, query);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

export const getOwnerSummary = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id;
        const summary = await service.getOwnerSummary(userId);
        res.status(200).json(summary);
    } catch (error) {
        next(error);
    }
};

export const getRequestDetails = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id;
        const role = req.user!.role;
        const requestId = req.params.id as string;
        const details = await service.getRequestDetails(userId, role, requestId);
        res.status(200).json(details);
    } catch (error) {
        next(error);
    }
};

export const updateStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id;
        const role = req.user!.role;
        const requestId = req.params.id as string;
        const validated = updateStatusSchema.parse(req.body);
        const updated = await service.updateStatus(userId, role, requestId, validated);
        res.status(200).json(updated);
    } catch (error) {
        next(error);
    }
};
