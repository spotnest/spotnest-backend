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
    | "ACTIVE"
    | "REJECTED"
    | "TERMINATED";

export interface IRentalAgreement extends Document {
    _id: Types.ObjectId;
    rental: Types.ObjectId;
    occupant: Types.ObjectId;
    tenant: Types.ObjectId;
    owner: Types.ObjectId;
    property: Types.ObjectId;
    monthlyRent: number;
    securityDepositShare: number;
    leaseStart: Date;
    leaseEnd: Date;
    terms: string;
    status: AgreementStatus;
    tenantAcceptedAt?: Date;
    ownerAcceptedAt?: Date;
    created_at: Date;
    updated_at: Date;
}
