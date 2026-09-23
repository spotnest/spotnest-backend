import mongoose, { Schema } from "mongoose";
import { UserRole, UserStatus, type IUser } from "./type.js";

const userSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: true,
            maxlength: 100,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            maxlength: 150,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            maxlength: 20,
        },
        password_hash: {
            type: String,
            required: true,
            maxlength: 255,
        },
        image: {
            type: String,
            default: "",
        },
        imagePublicId: { type: String, select: false },

        verificationStatus: {
            type: String,
            enum: ["unsubmitted", "pending", "approved", "rejected"],
            default: "unsubmitted",
        },
        idDocumentPublicId: { type: String, select: false }, // only field here that's genuinely sensitive
        idDocumentResourceType: {
            type: String,
            enum: ["image", "raw"],
            select: false,
        },
        idDocumentFormat: {
            type: String,
            enum: ["jpg", "png", "pdf"],
            select: false,
        },
        rejectionReason: { type: String },
        verificationSubmittedAt: { type: Date },
        verificationReviewedAt: { type: Date },
        verificationReviewedBy: { type: String },
        role: {
            type: String,
            enum: Object.values(UserRole),
            required: true,
            default: UserRole.USER,
        },
        isBlock: {
            type: Boolean,
            default: false,
        },
        permissions: {
            type: [String],
            default: [],
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: Object.values(UserStatus),
            required: true,
            default: UserStatus.ACTIVE,
        },
        otpHash: {
            type: String,
            select: false,
        },
        otpExpiry: {
            type: Date,
            select: false,
        },
        otpType: {
            type: String,
            enum: ["email_verify", "password_reset"],
            select: false,
        },
        otpAttempts: {
            type: Number,
            default: 0,
            select: false,
        },
        location: {
            type: {
                type: String,
                enum: ["Point"],
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
            },
        },
        locationName: { type: String, maxlength: 200 },
        locationResolvedName: { type: String, maxlength: 300 },
        locationUpdatedAt: { type: Date },
    },
    {
        timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;
