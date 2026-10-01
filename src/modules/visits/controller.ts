import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";

import visitService from "./service.js";
import { createVisitSchema } from "./validation.js";

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