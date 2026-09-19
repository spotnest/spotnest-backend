import mongoose, { Schema } from "mongoose";
import type { ISettings } from "./type.js";

const settingsSchema = new Schema<ISettings>(
    {
        key: { type: String, enum: ["global"], unique: true, default: "global" },
        ownerApprovalRequired: { type: Boolean, default: true },
        emailVerificationRequired: { type: Boolean, default: true },
        userRegistrationEnabled: { type: Boolean, default: true },
        ownerRegistrationEnabled: { type: Boolean, default: true },
        propertyApprovalRequired: { type: Boolean, default: false },
        propertyListingEnabled: { type: Boolean, default: true },
        defaultListingStatus: { type: String, enum: ["active", "inactive"], default: "inactive" },
        newOwnerRegistrationAlerts: { type: Boolean, default: true },
        ownerApprovalEmails: { type: Boolean, default: true },
        platformName: { type: String, default: "SpotNest", trim: true },
        supportEmail: { type: String, default: "", trim: true },
        supportPhone: { type: String, default: "", trim: true },
        currency: { type: String, default: "INR" },
        timezone: { type: String, default: "Asia/Kolkata" },
        defaultPaginationLimit: { type: Number, min: 1, max: 50, default: 10 },
        maintenanceMode: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.model<ISettings>("Settings", settingsSchema);
