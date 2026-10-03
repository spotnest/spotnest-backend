import mongoose, { Schema } from "mongoose";
import type { IBooking } from "./type.js";

const bookingSchema = new Schema<IBooking>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        propertyId: {
            type: Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },
        ownerId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        monthlyRent: {
            type: Number,
            required: true,
            min: 1,
        },
        advanceAmount: {
            type: Number,
            required: true,
            min: 1,
        },
        currency: {
            type: String,
            required: true,
            default: "INR",
        },
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED", "CONFIRMED", "ACTIVE", "COMPLETED"],
            default: "PENDING",
        },
        paymentStatus: {
            type: String,
            enum: ["NOT_DUE", "ADVANCE_PAYMENT_PENDING", "PAID"],
            default: "NOT_DUE",
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        notes: {
            type: String,
            maxlength: 500,
        },
        decisionNote: { type: String, maxlength: 500 },
        approvedAt: { type: Date },
        rejectedAt: { type: Date },
        confirmedAt: { type: Date },
    },
    {
        timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    }
);

bookingSchema.index({ userId: 1, created_at: -1 });
bookingSchema.index({ propertyId: 1, status: 1 });
bookingSchema.index({ ownerId: 1, status: 1, created_at: -1 });

const Booking = mongoose.model<IBooking>("Booking", bookingSchema);

export default Booking;
