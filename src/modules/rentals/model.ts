import mongoose, { Schema } from "mongoose";
import type { IRentalAgreement, IRentalOccupant } from "./type.js";

const rentalOccupantSchema = new Schema<IRentalOccupant>(
    {
        rental: {
            type: Schema.Types.ObjectId,
            ref: "Rental",
            required: true,
            index: true,
        },
        tenant: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        rentAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        securityDepositShare: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        status: {
            type: String,
            enum: ["PENDING", "ACTIVE", "LEFT", "TERMINATED"],
            default: "PENDING",
            index: true,
        },
        joinedAt: {
            type: Date,
            default: Date.now,
        },
        leftAt: {
            type: Date,
        },
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    }
);

// Prevent duplicate active occupants in the same rental
rentalOccupantSchema.index(
    { rental: 1, tenant: 1, status: 1 },
    { unique: false }
);

const rentalAgreementSchema = new Schema<IRentalAgreement>(
    {
        rental: {
            type: Schema.Types.ObjectId,
            ref: "Rental",
            required: true,
            index: true,
        },
        occupant: {
            type: Schema.Types.ObjectId,
            ref: "RentalOccupant",
            required: true,
            index: true,
        },
        tenant: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        property: {
            type: Schema.Types.ObjectId,
            ref: "Property",
            required: true,
        },
        monthlyRent: {
            type: Number,
            required: true,
            min: 0,
        },
        securityDepositShare: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        leaseStart: {
            type: Date,
            required: true,
        },
        leaseEnd: {
            type: Date,
            required: true,
        },
        terms: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: [
                "DRAFT",
                "PENDING_TENANT",
                "PENDING_OWNER",
                "APPROVED_PENDING_PAYMENT",
                "ACTIVE",
                "REJECTED",
                "TERMINATED",
                "EXPIRED",
                "CANCELLED",
            ],
            default: "PENDING_TENANT",
            index: true,
        },
        tenantAcceptedAt: {
            type: Date,
        },
        ownerAcceptedAt: {
            type: Date,
        },
        paymentDeadline: {
            type: Date,
            index: true,
        },
        advancePaidAt: {
            type: Date,
        },
        version: {
            type: Number,
            default: 1,
        },
        maintenanceFee: {
            type: Number,
            default: 0,
        },
        paymentFrequency: {
            type: String,
            default: "monthly",
        },
        noticePeriodDays: {
            type: Number,
            default: 30,
        },
        deliveryStatus: {
            type: String,
            enum: ["PENDING", "DELIVERED", "FAILED"],
            default: "DELIVERED",
        },
        deliveryError: {
            type: String,
        },
        cancelledAt: {
            type: Date,
        },
        cancelledBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        history: [
            {
                version: { type: Number, required: true },
                terms: { type: String, required: true },
                monthlyRent: { type: Number, required: true },
                securityDepositShare: { type: Number, required: true },
                modifiedAt: { type: Date, default: Date.now },
                modifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
                note: { type: String },
            },
        ],
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    }
);

rentalAgreementSchema.index({ rental: 1, tenant: 1 });

export const RentalOccupant = mongoose.model<IRentalOccupant>(
    "RentalOccupant",
    rentalOccupantSchema
);

export const RentalAgreement = mongoose.model<IRentalAgreement>(
    "RentalAgreement",
    rentalAgreementSchema
);
