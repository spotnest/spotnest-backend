import type { Document, Types } from "mongoose";

export type BookingStatus =
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "CONFIRMED"
    | "ACTIVE"
    | "COMPLETED"
    | "EXPIRED";
export type BookingPaymentStatus = "NOT_DUE" | "ADVANCE_PAYMENT_PENDING" | "PAID";

export type TenantInquiryStatus =
    | "PENDING"
    | "ACCEPTED_MOVE_OUT"
    | "WANTS_EXTENSION"
    | "CUSTOM_MESSAGE"
    | "EXPIRED_DEEMED_CONSENT";

export type TenantInquiryChoice = "MOVE_OUT" | "EXTEND" | "CUSTOM";

export interface ITenantInquiry {
    currentTenantId: Types.ObjectId;
    currentRentalId?: Types.ObjectId;
    status: TenantInquiryStatus;
    deadline: Date;
    question: string;
    respondedAt?: Date;
    responseChoice?: TenantInquiryChoice;
    responseMessage?: string;
    deemedConsentApplied?: boolean;
}

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
    tenantInquiry?: ITenantInquiry;
    created_at: Date;
    updated_at: Date;
}
