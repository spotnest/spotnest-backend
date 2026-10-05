import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";

import visitService from "./service.js";
import {
    approveVisitSchema,
    adminVisitQuerySchema,
    createVisitSchema,
    rejectVisitSchema,
    rescheduleVisitSchema,
    visitIdSchema,
} from "./validation.js";

export const createVisit = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const data = createVisitSchema.parse(req.body);

        const visit = await visitService.createVisit(
            req.user!.id,
            data
        );

        res.status(201).json(visit);
    } catch (err) {
        next(err);
    }
};

export const getMyVisits = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const visits = await visitService.getMyVisits(
            req.user!.id
        );

        res.status(200).json(visits);
    } catch (err) {
        next(err);
    }
};

export const getOwnerVisits = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const visits = await visitService.getOwnerVisits(
            req.user!.id
        );

        res.status(200).json(visits);
    } catch (err) {
        next(err);
    }
};

export const getAdminVisits = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const data = adminVisitQuerySchema.parse(
            req.query
        );

        const result =
            await visitService.getAdminVisits(
                data.page,
                data.limit,
                data.status
            );

        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

export const getVisitById = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const visitId = visitIdSchema.parse(
            req.params.id
        );

        const visit = await visitService.getVisitById(
            visitId,
            req.user!.id
        );

        res.status(200).json(visit);
    } catch (err) {
        next(err);
    }
};

export const approveVisit = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const visitId = visitIdSchema.parse(
            req.params.id
        );

        const data = approveVisitSchema.parse(
            req.body
        );

        const visit = await visitService.approveVisit(
            req.user!.id,
            visitId,
            data
        );

        res.status(200).json(visit);
    } catch (err) {
        next(err);
    }
};

export const rejectVisit = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const visitId = visitIdSchema.parse(
            req.params.id
        );

        const data = rejectVisitSchema.parse(
            req.body
        );

        const visit = await visitService.rejectVisit(
            req.user!.id,
            visitId,
            data
        );

        res.status(200).json(visit);
    } catch (err) {
        next(err);
    }
};

export const rescheduleVisit = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const visitId = visitIdSchema.parse(
            req.params.id
        );

        const data =
            rescheduleVisitSchema.parse(req.body);

        const visit =
            await visitService.rescheduleVisit(
                req.user!.id,
                visitId,
                data
            );

        res.status(200).json(visit);
    } catch (err) {
        next(err);
    }
};

export const cancelVisit = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const visitId = visitIdSchema.parse(
            req.params.id
        );

        const visit = await visitService.cancelVisit(
            req.user!.id,
            visitId
        );

        res.status(200).json(visit);
    } catch (err) {
        next(err);
    }
};

export const completeVisit = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const visitId = visitIdSchema.parse(
            req.params.id
        );

        const visit =
            await visitService.completeVisit(
                req.user!.id,
                visitId
            );

        res.status(200).json(visit);
    } catch (err) {
        next(err);
    }
};