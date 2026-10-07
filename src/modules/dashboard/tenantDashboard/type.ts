import type { Document, Types } from "mongoose";

export type RentalStatus = "scheduled" | "active" | "ended" | "cancelled";
export type SplitMode = "EQUAL" | "CUSTOM";
export type PaymentStatus = "PAID" | "PENDING" | "DUE" | "OVERDUE" | "FAILED" | "paid" | "pending" | "due" | "overdue" | "failed";
export type PaymentType = "ADVANCE" | "MONTHLY_RENT" | "rent" | "security_deposit" | "late_fee" | "other";
export type MaintenanceStatus = "pending" | "in_progress" | "resolved" | "rejected" | "cancelled";
export type MaintenancePriority = "low" | "medium" | "high" | "urgent";

export interface IRental extends Document {
    booking?: Types.ObjectId;
    property: Types.ObjectId;
    owner: Types.ObjectId;
    tenant: Types.ObjectId;
    monthlyRent: number;
    securityDeposit: number;
    leaseStart: Date;
    leaseEnd: Date;
    paymentFrequency: "monthly";
    splitMode?: SplitMode;
    status: RentalStatus;
    created_at: Date;
    updated_at: Date;
}

export interface IPayment extends Document {
    booking?: Types.ObjectId;
    rental?: Types.ObjectId;
    occupant?: Types.ObjectId;
    tenant: Types.ObjectId;
    owner?: Types.ObjectId;
    property?: Types.ObjectId;
    type: PaymentType;
    amount: number;
    currency?: string;
    billingMonth?: string;
    dueDate?: Date;
    paidAt?: Date;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    status: PaymentStatus;
    method?: string;
    referenceId?: string;
    lateFee: number;
    lateFeeReason?: string;
    created_at: Date;
    updated_at: Date;
}

export interface IMaintenanceRequest extends Document {
    rental: Types.ObjectId;
    property: Types.ObjectId;
    tenant: Types.ObjectId;
    owner: Types.ObjectId;
    title: string;
    description: string;
    priority: MaintenancePriority;
    category?: string;
    status: MaintenanceStatus;
    ownerResponse?: string;
    resolution?: string;
    created_at: Date;
    updated_at: Date;
}
