import Booking from "./model.js";
import type { IBooking } from "./type.js";

const createBooking = async (payload: Partial<IBooking>) => Booking.create(payload);

const findById = async (id: string) => Booking.findById(id);

const findByUser = async (userId: string) =>
    Booking.find({ userId })
        .populate("propertyId", "title price advanceAmount address images")
        .sort({ created_at: -1 });

const findForUser = async (bookingId: string, userId: string) =>
    Booking.findOne({ _id: bookingId, userId })
        .populate("propertyId", "title price advanceAmount address images")
        .populate("ownerId", "name email phone")

const findPendingForOwner = async (ownerId: string) =>
    Booking.find({ ownerId, status: "PENDING" })
        .populate("userId", "name email phone image")
        .populate("propertyId", "title price advanceAmount address images")
        .sort({ created_at: -1 });

const findForOwner = async (bookingId: string, ownerId: string) =>
    Booking.findOne({ _id: bookingId, ownerId });

/**
 * Applies an owner's decision only if the request is still PENDING. The
 * status check and the write are a single atomic operation, so a retried or
 * double-clicked review cannot be applied (or notified) twice.
 */
const reviewPendingForOwner = async (
    bookingId: string,
    ownerId: string,
    update: Pick<IBooking, "status" | "paymentStatus"> & Partial<Pick<IBooking, "approvedAt" | "rejectedAt" | "decisionNote">>
) =>
    Booking.findOneAndUpdate(
        { _id: bookingId, ownerId, status: "PENDING" },
        { $set: update },
        { returnDocument: "after" }
    );

const updateBooking = async (id: string, payload: Partial<IBooking>) =>
    Booking.findByIdAndUpdate(id, payload, { new: true });

export default {
    createBooking,
    findById,
    findByUser,
    findForUser,
    findPendingForOwner,
    findForOwner,
    reviewPendingForOwner,
    updateBooking,
};
