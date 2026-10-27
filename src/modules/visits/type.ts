import type { Document, Types } from "mongoose";

export type VisitStatus =
    | "pending"
    | "approved"
    | "rejected"
    | "rescheduled"
    | "cancelled"
    | "completed";

export interface IVisit extends Document {
    property: Types.ObjectId;
    requester: Types.ObjectId;
    owner: Types.ObjectId;

    requestedDate: Date;
    requestedTime: string;

    scheduledDate?: Date;
    scheduledTime?: string;

    status: VisitStatus;

    message?: string;
    rejectionReason?: string;
    rescheduleReason?: string;

    created_at: Date;
    updated_at: Date;
}