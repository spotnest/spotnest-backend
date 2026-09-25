import mongoose, { Schema } from "mongoose";
import type { IMaintenanceRequest, IPayment, IRental } from "./type.js";

const rentalSchema = new Schema<IRental>({
    property: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tenant: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    monthlyRent: { type: Number, required: true, min: 0 },
    securityDeposit: { type: Number, required: true, min: 0 },
    leaseStart: { type: Date, required: true },
    leaseEnd: { type: Date, required: true },
    paymentFrequency: { type: String, enum: ["monthly"], default: "monthly" },
    status: { type: String, enum: ["active", "ended", "cancelled"], default: "active", index: true },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });
rentalSchema.index({ tenant: 1, status: 1 });

const paymentSchema = new Schema<IPayment>({
    rental: { type: Schema.Types.ObjectId, ref: "Rental", required: true, index: true },
    tenant: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["rent", "security_deposit", "late_fee", "other"], required: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date }, paidAt: { type: Date },
    status: { type: String, enum: ["paid", "pending", "due", "overdue", "failed"], required: true, index: true },
    method: { type: String, maxlength: 100 }, referenceId: { type: String, maxlength: 200 },
    lateFee: { type: Number, default: 0, min: 0 }, lateFeeReason: { type: String, maxlength: 500 },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });
paymentSchema.index({ tenant: 1, rental: 1, dueDate: -1 });

const maintenanceSchema = new Schema<IMaintenanceRequest>({
    rental: { type: Schema.Types.ObjectId, ref: "Rental", required: true, index: true },
    property: { type: Schema.Types.ObjectId, ref: "Property", required: true },
    tenant: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, maxlength: 150 }, description: { type: String, required: true, maxlength: 3000 },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    category: { type: String, maxlength: 100 },
    status: { type: String, enum: ["pending", "in_progress", "resolved", "rejected", "cancelled"], default: "pending", index: true },
    ownerResponse: { type: String, maxlength: 3000 }, resolution: { type: String, maxlength: 3000 },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });
maintenanceSchema.index({ tenant: 1, created_at: -1 });

export const Rental = mongoose.model<IRental>("Rental", rentalSchema);
export const Payment = mongoose.model<IPayment>("Payment", paymentSchema);
export const MaintenanceRequest = mongoose.model<IMaintenanceRequest>("MaintenanceRequest", maintenanceSchema);
