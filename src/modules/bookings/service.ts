import mongoose from "mongoose";
import Property from "../properties/model.js";
import { AppError } from "../../shared/errors/AppError.js";
import Booking from "./model.js";
import bookingRepository from "./repository.js";
import notificationService from "../notifications/service.js";
import { emitDashboardUpdate } from "../../shared/socket/index.js";
import type { CreateBookingInput } from "./validation.js";
import type { ReviewBookingInput } from "./validation.js";
import { Rental } from "../dashboard/tenantDashboard/model.js";
import { createDefaultOccupantAndAgreement } from "../rentals/service.js";
const createBooking = async (userId: string, payload: CreateBookingInput) => {
    const property = await Property.findById(payload.propertyId);
    if (!property) {
        throw new AppError(404, "Property not found");
    }
    if (property.status !== "active") {
        throw new AppError(400, "This property is not available for rental requests");
    }
    if (property.owner.toString() === userId) {
        throw new AppError(400, "You cannot request to rent your own property");
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const requestedStart = new Date(Date.UTC(
        payload.startDate.getUTCFullYear(),
        payload.startDate.getUTCMonth(),
        payload.startDate.getUTCDate()
    ));
    if (requestedStart < today || payload.endDate <= payload.startDate) {
        throw new AppError(400, "Choose a future start date and an end date after it");
    }

    const monthlyRent = Number(property.price);
    const advanceAmount = Number(property.advanceAmount ?? property.price);
    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0 || !Number.isFinite(advanceAmount) || advanceAmount <= 0) {
        throw new AppError(400, "Property rental terms are invalid");
    }

    const confirmedBooking = await Booking.findOne({
        propertyId: property._id,
        status: { $in: ["CONFIRMED", "ACTIVE"] },
        startDate: { $lt: payload.endDate },
        endDate: { $gt: payload.startDate },
    }).lean();
    if (confirmedBooking) {
        if (confirmedBooking.userId.toString() === userId) {
            throw new AppError(409, "You already have an active rental for this property");
        }
        throw new AppError(409, "This property is already rented for the selected dates");
    }

    const myExistingRequest = await Booking.findOne({
        propertyId: property._id,
        userId: new mongoose.Types.ObjectId(userId),
        status: { $in: ["PENDING", "APPROVED"] },
    }).lean();
    if (myExistingRequest) {
        if (myExistingRequest.status === "APPROVED") {
            throw new AppError(409, "Your rental request is already approved. Please proceed to pay advance.");
        }
        throw new AppError(409, "You already have a pending rental request for this property.");
    }

    const booking = await bookingRepository.createBooking({
        userId: new mongoose.Types.ObjectId(userId),
        propertyId: property._id,
        ownerId: property.owner,
        monthlyRent,
        advanceAmount,
        currency: "INR",
        status: "PENDING",
        paymentStatus: "NOT_DUE",
        startDate: payload.startDate,
        endDate: payload.endDate,
        ...(payload.notes ? { notes: payload.notes } : {}),
    });

    await notificationService.notify({
        recipient: property.owner.toString(),
        title: "New rental request",
        message: `A tenant requested to rent ${property.title}.`,
        type: "rental_request",
        referenceId: booking._id.toString(),
        referenceType: "booking",
        data: { bookingId: booking._id.toString(), propertyId: property._id.toString() },
        dedupeKey: `rental-request:${booking._id.toString()}`,
    });
    emitDashboardUpdate(
        { userIds: [property.owner, userId], admins: true },
        "booking",
        "created",
        booking._id
    );

    return booking.toObject();
};

const getBookingForUser = async (bookingId: string, userId: string) => {
    const booking = await bookingRepository.findForUser(bookingId, userId);
    if (!booking) {
        throw new AppError(404, "Booking not found");
    }
    return booking.toObject();
};

const listMyBookings = async (userId: string) => {
    const bookings = await bookingRepository.findByUser(userId);
    return bookings.map((booking) => booking.toObject());
};

const listOwnerRequests = async (ownerId: string) => {
    const bookings = await bookingRepository.findPendingForOwner(ownerId);
    return bookings.map((booking) => booking.toObject());
};

const reviewBooking = async (bookingId: string, ownerId: string, input: ReviewBookingInput) => {
    const booking = await bookingRepository.findForOwner(bookingId, ownerId);
    if (!booking) throw new AppError(404, "Rental request not found");
    if (booking.status !== "PENDING") throw new AppError(409, "This rental request has already been reviewed");

    booking.status = input.decision;
    booking.paymentStatus = input.decision === "APPROVED" ? "ADVANCE_PAYMENT_PENDING" : "NOT_DUE";
    if (input.decision === "APPROVED") booking.approvedAt = new Date();
    else booking.rejectedAt = new Date();
    if (input.decisionNote) booking.decisionNote = input.decisionNote;
    await booking.save();

    await notificationService.createNotification({
        recipient: booking.userId.toString(),
        title: input.decision === "APPROVED" ? "Rental request approved" : "Rental request rejected",
        message: input.decision === "APPROVED"
            ? "Your rental request was approved. You can now pay the advance."
            : "Your rental request was rejected by the property owner.",
        type: input.decision === "APPROVED" ? "rental_approved" : "rental_rejected",
        referenceId: booking._id.toString(),
        referenceType: "booking",
        data: { bookingId: booking._id.toString(), propertyId: booking.propertyId.toString() },
        dedupeKey: `rental-request-decision:${booking._id.toString()}`,
    });
    emitDashboardUpdate(
        { userIds: [booking.userId, booking.ownerId], admins: true },
        "booking",
        approved ? "approved" : "rejected",
        booking._id
    );

    return booking.toObject();
};

export default {
    createBooking,
    getBookingForUser,
    listMyBookings,
    listOwnerRequests,
    reviewBooking,
};
