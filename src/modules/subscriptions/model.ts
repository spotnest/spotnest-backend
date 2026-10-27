import mongoose, { Schema } from "mongoose";
import type { ISubscription } from "./type.js";

const subscriptionSchema = new Schema<ISubscription>(
    {
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        planId: {
            type: String,
            required: true,
            enum: [
                "basic_monthly",
                "basic_quarterly",
                "pro_monthly",
                "pro_quarterly",
            ],
        },
        tier: { type: String, required: true, enum: ["basic", "pro"] },
        period: {
            type: String,
            required: true,
            enum: ["monthly", "quarterly"],
        },
        durationDays: { type: Number, required: true, min: 1 },

       
        listingLimit: { type: Number, default: null },
        maxImages: { type: Number, required: true, min: 1 },

        amountPaise: { type: Number, required: true, min: 1 },
        currency: { type: String, default: "INR" },

        status: {
            type: String,
            enum: ["created", "active", "failed"],
            default: "created",
            index: true,
        },

        razorpayOrderId: { type: String, required: true, unique: true },
        razorpayPaymentId: { type: String },

        startsAt: { type: Date },
        expiresAt: { type: Date, index: true },
    },
    { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);


subscriptionSchema.index({ owner: 1, status: 1, expiresAt: 1 });

export default mongoose.model<ISubscription>(
    "Subscription",
    subscriptionSchema
);
