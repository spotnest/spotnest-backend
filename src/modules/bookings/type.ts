import type { Document, Types } from "mongoose";

export type BookingStatus = "PENDING" | "APPROVED" | "REJECTED" | "CONFIRMED" | "ACTIVE" | "COMPLETED";
export type BookingPaymentStatus = "NOT_DUE" | "ADVANCE_PAYMENT_PENDING" | "PAID";

export interface IBooking extends Document {
    userId: Types.ObjectId;
    propertyId: Types.ObjectId;
    ownerId: Types.ObjectId;
    monthlyRent: number;
    advanceAmount: number;
    currency: string;
    status: BookingStatus;
    paymentStatus: BookingPaymentStatus;
    startDate: Date;
    endDate: Date;
    notes?: string;
    decisionNote?: string;
    approvedAt?: Date;
    rejectedAt?: Date;
    confirmedAt?: Date;
    created_at: Date;
    updated_at: Date;
}
