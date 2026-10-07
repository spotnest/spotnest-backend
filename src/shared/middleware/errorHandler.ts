import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";

const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
            // Only present when the error set one. Clients match on the code
            // (LISTING_LIMIT_REACHED) to pick the right recovery UI.
            ...(err.code ? { code: err.code } : {}),
        });
        return;
    }

    if (err instanceof multer.MulterError) {
        res.status(400).json({
            success: false,
            message: err.message,
        });
        return;
    }

    if (err instanceof ZodError) {
        res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: err.flatten(),
        });
        return;
    }

    if (
        (err as { name?: string })?.name === "CastError" ||
        (err as { kind?: string })?.kind === "ObjectId"
    ) {
        res.status(404).json({
            success: false,
            message: "Resource not found",
        });
        return;
    }

    console.error("Unhandled error:", err);

    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
};

export default errorHandler;
