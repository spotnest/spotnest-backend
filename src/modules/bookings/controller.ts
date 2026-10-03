import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import bookingService from "./service.js";
import { createBookingSchema, reviewBookingSchema } from "./validation.js";

export const createBooking = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const payload = createBookingSchema.parse(req.body);
        const booking = await bookingService.createBooking(req.user!.id, payload);

        res.status(201).json({
            success: true,
            data: booking,
        });
    } catch (error) {
        next(error);
    }
};

export const getBooking = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const booking = await bookingService.getBookingForUser(req.params.id as string, req.user!.id);
        res.status(200).json({
            success: true,
            data: booking,
        });
    } catch (error) {
        next(error);
    }
};

export const listMyBookings = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const bookings = await bookingService.listMyBookings(req.user!.id);
        res.status(200).json({
            success: true,
            data: bookings,
        });
    } catch (error) {
        next(error);
    }
};

export const listOwnerRequests = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const bookings = await bookingService.listOwnerRequests(req.user!.id);
        res.status(200).json({ success: true, data: bookings });
    } catch (error) {
        next(error);
    }
};

export const reviewBooking = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const input = reviewBookingSchema.parse(req.body);
        const booking = await bookingService.reviewBooking(req.params.id as string, req.user!.id, input);
        res.status(200).json({ success: true, data: booking });
    } catch (error) {
        next(error);
    }
};
