import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import { AppError } from "../../shared/errors/AppError.js";
import subscriptionService from "./service.js";
import { checkoutSchema, verifySchema } from "./validation.js";

/**
 * GET /subscriptions/plans
 *
 * Public — the pricing page must render before the owner has a session.
 */
export const listPlans = async (
    _req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        res.status(200).json(subscriptionService.listPlans());
    } catch (err) {
        next(err);
    }
};

/**
 * GET /subscriptions/me
 *
 * Current plan, usage and whether another listing can be created.
 */
export const getMySubscription = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const entitlement = await subscriptionService.getEntitlement(
            req.user!.id
        );
        res.status(200).json(entitlement);
    } catch (err) {
        next(err);
    }
};

/**
 * POST /subscriptions/checkout
 *
 * Creates the Razorpay order server-side. The client sends only a planId.
 */
export const createCheckout = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const input = checkoutSchema.parse(req.body);
        const order = await subscriptionService.createCheckout(
            req.user!.id,
            input
        );
        res.status(201).json(order);
    } catch (err) {
        next(err);
    }
};

/**
 * POST /subscriptions/verify
 *
 * Confirms the checkout signature and activates the plan.
 */
export const verifyCheckout = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const input = verifySchema.parse(req.body);
        const entitlement = await subscriptionService.verifyCheckout(
            req.user!.id,
            input
        );
        res.status(200).json(entitlement);
    } catch (err) {
        next(err);
    }
};

/**
 * POST /subscriptions/webhook
 *
 * Mounted in app.ts BEFORE express.json() with express.raw(), because the
 * signature covers the exact raw bytes and a re-serialized body will not
 * verify.
 *
 * No authentication middleware — authenticity comes from the
 * x-razorpay-signature header.
 */
export const webhook = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!Buffer.isBuffer(req.body)) {
            throw new AppError(400, "Expected a raw request body");
        }

        const signature =
            (req.headers["x-razorpay-signature"] as string | undefined) ?? "";

        const result = await subscriptionService.handleWebhookEvent(
            req.body,
            signature
        );

        res.status(200).json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};
