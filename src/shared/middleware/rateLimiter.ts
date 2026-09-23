import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.js";

interface RateLimitRecord {
    count: number;
    resetTime: number;
}

export const createRateLimiter = (options: { windowMs: number; max: number; message?: string }) => {
    const records = new Map<string, RateLimitRecord>();

    // Cleanup expired entries periodically (every 5 minutes)
    const timer = setInterval(() => {
        const now = Date.now();
        for (const [ip, record] of records.entries()) {
            if (now > record.resetTime) {
                records.delete(ip);
            }
        }
    }, 5 * 60 * 1000);
    if (timer.unref) {
        timer.unref();
    }

    return (req: Request, _res: Response, next: NextFunction): void => {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const now = Date.now();

        let record = records.get(ip);
        if (!record || now > record.resetTime) {
            record = {
                count: 1,
                resetTime: now + options.windowMs,
            };
            records.set(ip, record);
            return next();
        }

        record.count += 1;
        if (record.count > options.max) {
            return next(
                new AppError(
                    429,
                    options.message || "Too many requests from this IP, please try again later."
                )
            );
        }

        return next();
    };
};

export const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per 15 minutes
    message: "Too many authentication attempts. Please try again in 15 minutes.",
});
