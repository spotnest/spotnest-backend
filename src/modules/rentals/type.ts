import type { Document, Types } from "mongoose";

export type OccupantStatus = "PENDING" | "ACTIVE" | "LEFT" | "TERMINATED";

export interface IRentalOccupant extends Document {
    _id: Types.ObjectId;
    rental: Types.ObjectId;
    tenant: Types.ObjectId;
    rentAmount: number;
    securityDepositShare: number;
    status: OccupantStatus;
    joinedAt: Date;
    leftAt?: Date;
    created_at: Date;
    updated_at: Date;
}

export type AgreementStatus =
    | "DRAFT"
    | "PENDING_TENANT"
    | "PENDING_OWNER"
    | "APPROVED_PENDING_PAYMENT"
    | "ACTIVE"
    | "REJECTED"
    | "TERMINATED"
    | "EXPIRED"
    | "CANCELLED";

export interface IAgreementRevision {
    version: number;
    terms: string;
    monthlyRent: number;
    securityDepositShare: number;
    modifiedAt: Date;
    modifiedBy: Types.ObjectId;
    note?: string;
}

export interface IRentalAgreement extends Document {
    _id: Types.ObjectId;
    rental: Types.ObjectId;
    occupant: Types.ObjectId;
    tenant: Types.ObjectId;
    owner: Types.ObjectId;
    property: Types.ObjectId;
    monthlyRent: number;
    securityDepositShare: number;
    maintenanceFee?: number | null;
    paymentFrequency?: string | null;
    noticePeriodDays?: number | null;
    leaseStart: Date;
    leaseEnd: Date;
    terms: string;
    status: AgreementStatus;
    tenantAcceptedAt?: Date | null;
    ownerAcceptedAt?: Date | null;
    paymentDeadline?: Date | null;
    advancePaidAt?: Date | null;
    version?: number | null;
    deliveryStatus?: "PENDING" | "DELIVERED" | "FAILED" | null;
    deliveryError?: string | null;
    cancelledAt?: Date | null;
    cancelledBy?: Types.ObjectId | null;
    history?: IAgreementRevision[];
    created_at: Date;
    updated_at: Date;
}