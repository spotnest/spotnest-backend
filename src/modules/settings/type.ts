import type { Document } from "mongoose";

export interface ISettings extends Document {
    key: "global";
    ownerApprovalRequired: boolean;
    emailVerificationRequired: boolean;
    userRegistrationEnabled: boolean;
    ownerRegistrationEnabled: boolean;
    propertyApprovalRequired: boolean;
    propertyListingEnabled: boolean;
    newOwnerRegistrationAlerts: boolean;
    ownerApprovalEmails: boolean;
    platformName: string;
    supportEmail: string;
    supportPhone: string;
    currency: string;
    timezone: string;
    defaultPaginationLimit: number;
    maintenanceMode: boolean;
}

export type SettingsUpdate = Partial<Omit<ISettings, "_id" | "key" | "createdAt" | "updatedAt">>;
