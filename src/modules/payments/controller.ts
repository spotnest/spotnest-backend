import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import { AppError } from "../../shared/errors/AppError.js";
import paymentService from "./service.js";
import { createAdvanceOrderSchema, createMonthlyRentOrderSchema, verifyPaymentSchema } from "./validation.js";
import { verifyWebhookSignature } from "./razorpay.js";
import authRepository from "../auth/repository.js";
import { toAuthResponse } from "../../shared/utils/token.js";
import { setAuthCookies } from "../auth/controller.js";

export const createAdvanceOrder = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const payload = createAdvanceOrderSchema.parse(req.body);
        const order = await paymentService.createAdvanceOrder(payload.bookingId, req.user!.id);

        res.status(200).json({
            success: true,
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

export const createMonthlyRentOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const payload = createMonthlyRentOrderSchema.parse(req.body);
        const order = await paymentService.createMonthlyRentOrder(payload.bookingId, payload.billingMonth, req.user!.id);
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};
export const verifyPayment = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const payload = verifyPaymentSchema.parse(req.body);
        const result = await paymentService.verifyPayment(payload, req.user!.id);

        let userResponse = null;
        if (payload.type === "ADVANCE") {
            const updatedUser = await authRepository.findById(req.user!.id);
            if (updatedUser) {
                const authResp = toAuthResponse(updatedUser);
                setAuthCookies(res, authResp.token, authResp.refreshToken);
                userResponse = authResp.user;
            }
        }

        res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            data: {
                ...result,
                ...(userResponse ? { user: userResponse } : {}),
            },
        });
    } catch (error) {
        next(error);
    }
};

export const webhook = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const rawBody = req.body as Buffer | string | undefined;
        const signature = req.headers["x-razorpay-signature"] as string | undefined;

        if (!rawBody || !signature) {
            throw new AppError(400, "Missing Razorpay webhook payload");
        }

        const payloadString = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
        if (!verifyWebhookSignature(payloadString, signature)) {
            throw new AppError(400, "Invalid Razorpay webhook signature");
        }

        const event = JSON.parse(payloadString) as Parameters<typeof paymentService.handleWebhook>[0];
        await paymentService.handleWebhook(event);

        return res.status(200).json({ success: true, message: "Webhook acknowledged" });
    } catch (error) {
        next(error);
    }
};

export const getAdminPayments = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const { page, limit, type, status, search } = req.query;
        const result = await paymentService.getAdminPayments({
            ...(page ? { page: Number(page) } : {}),
            ...(limit ? { limit: Number(limit) } : {}),
            ...(type ? { type: String(type) } : {}),
            ...(status ? { status: String(status) } : {}),
            ...(search ? { search: String(search) } : {}),
        });

        res.status(200).json({
            success: true,
            data: result.payments,
            summary: result.summary,
            pagination: result.pagination,
        });
    } catch (error) {
        next(error);
    }
};

