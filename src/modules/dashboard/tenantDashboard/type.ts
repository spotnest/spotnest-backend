import type { Document, Types } from "mongoose";

export type RentalStatus = "active" | "ended" | "cancelled";
export type PaymentStatus = "paid" | "pending" | "due" | "overdue" | "failed";
export type PaymentType = "rent" | "security_deposit" | "late_fee" | "other";
export type MaintenanceStatus = "pending" | "in_progress" | "resolved" | "rejected" | "cancelled";
export type MaintenancePriority = "low" | "medium" | "high" | "urgent";

export interface IRental extends Document {
    property: Types.ObjectId;
    owner: Types.ObjectId;
    tenant: Types.ObjectId;
    monthlyRent: number;
    securityDeposit: number;
    leaseStart: Date;
    leaseEnd: Date;
    paymentFrequency: "monthly";
    status: RentalStatus;
    created_at: Date;
    updated_at: Date;
}

export interface IPayment extends Document {
    rental: Types.ObjectId;
    tenant: Types.ObjectId;
    type: PaymentType;
    amount: number;
    dueDate?: Date;
    paidAt?: Date;
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
