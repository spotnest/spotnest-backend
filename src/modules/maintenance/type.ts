import type { Document, Types } from "mongoose";

export const MAINTENANCE_CATEGORIES = [
    "Plumbing",
    "Electrical",
    "Appliance",
    "Structural",
    "Cleaning",
    "Other",
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export const MAINTENANCE_PRIORITIES = [
    "Low",
    "Normal",
    "High",
    "Emergency",
] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export const MAINTENANCE_STATUSES = [
    "PENDING",
    "ACCEPTED",
    "SCHEDULED",
    "IN_PROGRESS",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

/**
 * Defaults for a freshly created request.
 *
 * The explicit annotations tie each default to its enum: widen or rename a
 * value in the arrays above and these stop compiling, so the schema defaults
 * in `model.ts` and the literals in `service.ts` cannot drift apart.
 */
export const DEFAULT_MAINTENANCE_CATEGORY: MaintenanceCategory = "Other";
export const DEFAULT_MAINTENANCE_PRIORITY: MaintenancePriority = "Normal";
export const DEFAULT_MAINTENANCE_STATUS: MaintenanceStatus = "PENDING";

/**
 * Values the legacy tenant-dashboard API used before this module owned
 * maintenance. Kept so older clients posting `medium`/`urgent` keep working;
 * everything stored is the canonical enum value.
 */
const LEGACY_PRIORITY_ALIASES: Record<string, MaintenancePriority> = {
    medium: "Normal",
    urgent: "Emergency",
};

const LEGACY_STATUS_ALIASES: Record<string, MaintenanceStatus> = {
    in_progress: "IN_PROGRESS",
    resolved: "COMPLETED",
};

/**
 * Maps any casing of a priority ("normal", "NORMAL", "Normal") -- plus the
 * legacy aliases -- onto the canonical enum value. Returns undefined for
 * anything unrecognised so callers can reject or fall back to the default.
 */
export const normalizePriority = (
    value?: string | null
): MaintenancePriority | undefined => {
    if (typeof value !== "string") return undefined;
    const key = value.trim().toLowerCase();
    if (!key) return undefined;
    return (
        MAINTENANCE_PRIORITIES.find((priority) => priority.toLowerCase() === key) ??
        LEGACY_PRIORITY_ALIASES[key]
    );
};

export const normalizeStatus = (
    value?: string | null
): MaintenanceStatus | undefined => {
    if (typeof value !== "string") return undefined;
    const key = value.trim().toLowerCase();
    if (!key) return undefined;
    return (
        MAINTENANCE_STATUSES.find((status) => status.toLowerCase() === key) ??
        LEGACY_STATUS_ALIASES[key]
    );
};

export const normalizeCategory = (
    value?: string | null
): MaintenanceCategory | undefined => {
    if (typeof value !== "string") return undefined;
    const key = value.trim().toLowerCase();
    if (!key) return undefined;
    return MAINTENANCE_CATEGORIES.find((category) => category.toLowerCase() === key);
};

export interface IMaintenanceImage {
    publicId?: string | undefined;
    url: string;
}

export interface IMaintenanceStatusHistory {
    previousStatus?: MaintenanceStatus | undefined;
    newStatus: MaintenanceStatus;
    changedBy: Types.ObjectId;
    note?: string | undefined;
    timestamp: Date;
}

export interface IMaintenanceRequest extends Document {
    _id: Types.ObjectId;
    property: Types.ObjectId;
    tenant: Types.ObjectId;
    owner: Types.ObjectId;
    rental: Types.ObjectId;
    title: string;
    description: string;
    category: MaintenanceCategory;
    priority: MaintenancePriority;
    images: IMaintenanceImage[];
    status: MaintenanceStatus;
    preferredVisitDate?: Date | undefined;
    scheduledDate?: Date | undefined;
    rejectionReason?: string | undefined;
    resolutionNote?: string | undefined;
    tenantNotes?: string | undefined;
    statusHistory: IMaintenanceStatusHistory[];
    created_at: Date;
    updated_at: Date;
}

export interface MaintenanceRequestResponse {
    id: string;
    property: {
        id: string;
        title: string;
        address?: any;
    };
    tenant: {
        id: string;
        name: string;
        email: string;
        phone?: string | undefined;
    };
    owner: {
        id: string;
        name: string;
        email: string;
        phone?: string | undefined;
    };
    rentalId: string;
    title: string;
    description: string;
    category: MaintenanceCategory;
    priority: MaintenancePriority;
    images: IMaintenanceImage[];
    status: MaintenanceStatus;
    preferredVisitDate?: string | undefined;
    scheduledDate?: string | undefined;
    rejectionReason?: string | undefined;
    resolutionNote?: string | undefined;
    tenantNotes?: string | undefined;
    statusHistory: {
        previousStatus?: MaintenanceStatus | undefined;
        newStatus: MaintenanceStatus;
        changedBy: {
            id: string;
            name?: string | undefined;
            role?: string | undefined;
        };
        note?: string | undefined;
        timestamp: string;
    }[];
    createdAt: string;
    updatedAt: string;
}

export interface MaintenanceSummaryResponse {
    pending: number;
    accepted: number;
    scheduled: number;
    inProgress: number;
    completed: number;
    rejected: number;
    total: number;
}
