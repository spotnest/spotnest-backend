import mongoose, { Schema } from "mongoose";
import type { IMaintenanceRequest } from "./type.js";
import {
    DEFAULT_MAINTENANCE_CATEGORY,
    DEFAULT_MAINTENANCE_PRIORITY,
    DEFAULT_MAINTENANCE_STATUS,
    MAINTENANCE_CATEGORIES,
    MAINTENANCE_PRIORITIES,
    MAINTENANCE_STATUSES,
} from "./type.js";

const imageSchema = new Schema(
    {
        publicId: { type: String },
        url: { type: String, required: true },
    },
    { _id: false }
);

const statusHistorySchema = new Schema(
    {
        previousStatus: {
            type: String,
            enum: MAINTENANCE_STATUSES,
        },
        newStatus: {
            type: String,
            enum: MAINTENANCE_STATUSES,
            required: true,
        },
        changedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        note: { type: String, maxlength: 3000 },
        timestamp: { type: Date, default: Date.now },
    },
    { _id: false }
);

const maintenanceSchema = new Schema<IMaintenanceRequest>(
    {
        rental: {
            type: Schema.Types.ObjectId,
            ref: "Rental",
            required: true,
            index: true,
        },
        property: {
            type: Schema.Types.ObjectId,
            ref: "Property",
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
        title: {
            type: String,
            required: true,
            maxlength: 150,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            maxlength: 3000,
            trim: true,
        },
        category: {
            type: String,
            enum: MAINTENANCE_CATEGORIES,
            default: DEFAULT_MAINTENANCE_CATEGORY,
            required: true,
        },
        priority: {
            type: String,
            enum: MAINTENANCE_PRIORITIES,
            default: DEFAULT_MAINTENANCE_PRIORITY,
            required: true,
            index: true,
        },
        images: {
            type: [imageSchema],
            default: [],
        },
        status: {
            type: String,
            enum: MAINTENANCE_STATUSES,
            default: DEFAULT_MAINTENANCE_STATUS,
            index: true,
            required: true,
        },
        preferredVisitDate: {
            type: Date,
        },
        scheduledDate: {
            type: Date,
        },
        rejectionReason: {
            type: String,
            maxlength: 3000,
        },
        resolutionNote: {
            type: String,
            maxlength: 3000,
        },
        tenantNotes: {
            type: String,
            maxlength: 1000,
        },
        statusHistory: {
            type: [statusHistorySchema],
            default: [],
        },
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    }
);

maintenanceSchema.index({ tenant: 1, created_at: -1 });
maintenanceSchema.index({ owner: 1, status: 1, created_at: -1 });
maintenanceSchema.index({ property: 1, created_at: -1 });

// Registered unconditionally, like every other model in this codebase. The
// previous `mongoose.models.MaintenanceRequest || ...` guard silently handed
// back whichever schema was registered first, so a duplicate registration
// elsewhere turned into enum ValidationErrors at write time instead of a clear
// OverwriteModelError at boot.
export const MaintenanceRequest = mongoose.model<IMaintenanceRequest>(
    "MaintenanceRequest",
    maintenanceSchema
);

export default MaintenanceRequest;
