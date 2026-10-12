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
