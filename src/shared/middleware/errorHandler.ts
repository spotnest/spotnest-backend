import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
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

    // A schema-level rejection (enum, required, maxlength, ...) is bad input,
    // not a server fault. Report it like a Zod failure so the client can show
    // the message against the offending field instead of a blank 500.
    if (err instanceof mongoose.Error.ValidationError) {
        const fieldErrors: Record<string, string[]> = {};

        for (const [path, detail] of Object.entries(err.errors)) {
            fieldErrors[path] = [...(fieldErrors[path] ?? []), detail.message];
        }

        res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: {
                formErrors: [],
                fieldErrors,
            },
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
