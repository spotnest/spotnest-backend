import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";

const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
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

    console.error("Unhandled error:", err);

    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
};

export default errorHandler;
