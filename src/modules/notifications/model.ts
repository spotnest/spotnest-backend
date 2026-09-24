import mongoose, { Schema } from "mongoose";
import { notificationTypes, type INotification } from "./type.js";

const notificationSchema = new Schema<INotification>(
    {
        recipient: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        title: { type: String, required: true, maxlength: 160 },
        message: { type: String, required: true, maxlength: 1_000 },
        type: { type: String, enum: notificationTypes, required: true },
        isRead: { type: Boolean, default: false },
        referenceId: { type: Schema.Types.ObjectId },
        referenceType: { type: String, enum: ["user", "property"] },
    },
    { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

notificationSchema.index({ recipient: 1, created_at: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

const Notification = mongoose.model<INotification>("Notification", notificationSchema);

export default Notification;
