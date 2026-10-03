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

const updateBooking = async (id: string, payload: Partial<IBooking>) =>
    Booking.findByIdAndUpdate(id, payload, { new: true });

export default {
    createBooking,
    findById,
    findByUser,
    findForUser,
    findPendingForOwner,
    findForOwner,
    updateBooking,
};
