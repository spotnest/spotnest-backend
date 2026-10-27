import mongoose, { Schema } from "mongoose";
import { notificationReferenceTypes, notificationTypes } from "./type.js";
import type { INotification } from "./type.js";

const notificationSchema = new Schema<INotification>(
    {
        recipient: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            maxlength: 160,
        },
        message: {
            type: String,
            required: true,
            maxlength: 1_000,
        },
        type: {
            type: String,
            enum: notificationTypes,
            required: true,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        referenceId: {
            type: Schema.Types.ObjectId,
        },
        referenceType: {
            type: String,
            enum: notificationReferenceTypes,
        },
        data: {
            type: Schema.Types.Mixed,
        },
        dedupeKey: {
            type: String,
            maxlength: 200,
        },
        count: {
            type: Number,
            default: 1,
        },
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    },
);

notificationSchema.index({ recipient: 1, created_at: -1 });

// Partial so existing rows (and notifications created without a key, such as
// the per-conversation chat notification) are unaffected.
notificationSchema.index(
    { recipient: 1, dedupeKey: 1 },
    { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);

export default mongoose.model<INotification>(
    "Notification",
    notificationSchema,
);
