import mongoose, { Schema } from "mongoose";
import type { IVisit, VisitStatus } from "./type.js";

const visitStatuses: VisitStatus[] = [
    "pending",
    "approved",
    "rejected",
    "rescheduled",
    "cancelled",
    "completed",
];

const visitSchema = new Schema<IVisit>(
    {
        property: {
            type: Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },

        requester: {
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

        requestedDate: {
            type: Date,
            required: true,
        },

        requestedTime: {
            type: String,
            required: true,
            trim: true,
        },

        scheduledDate: {
            type: Date,
        },

        scheduledTime: {
            type: String,
            trim: true,
        },

        status: {
            type: String,
            enum: visitStatuses,
            required: true,
            default: "pending",
            index: true,
        },

        message: {
            type: String,
            maxlength: 1_000,
            trim: true,
        },

        rejectionReason: {
            type: String,
            maxlength: 1_000,
            trim: true,
        },

        rescheduleReason: {
            type: String,
            maxlength: 1_000,
            trim: true,
        },
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    }
);

/**
 * Useful for owner dashboards:
 * fetch the owner's newest visit requests first.
 */
visitSchema.index({
    owner: 1,
    status: 1,
    created_at: -1,
});

/**
 * Useful for a user's visit history.
 */
visitSchema.index({
    requester: 1,
    status: 1,
    created_at: -1,
});

/**
 * Useful for checking visits belonging to a property.
 */
visitSchema.index({
    property: 1,
    created_at: -1,
});


visitSchema.index(
    { requester: 1, property: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: "pending",
        },
    }
);
const Visit = mongoose.model<IVisit>("Visit", visitSchema);

export default Visit;