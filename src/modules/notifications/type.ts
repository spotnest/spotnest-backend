import type { Document, Types } from "mongoose";

export const notificationTypes = [
    "owner_approval_request",
    "owner_approved",
    "owner_rejected",
    "property_status",
    "rental_request",
    "rental_approved",
    "rental_rejected",
    "chat_message",
    "system",
] as const;

export type NotificationType = (typeof notificationTypes)[number];
export type NotificationReferenceType = "user" | "property" | "conversation" | "booking";

export interface NotificationData {
    conversationId?: string;
    propertyId?: string;
    senderId?: string;
}

export interface INotification extends Document {
    recipient: Types.ObjectId;
    title: string;
    message: string;
    type: NotificationType;
    isRead: boolean;
    referenceId?: Types.ObjectId;
    referenceType?: NotificationReferenceType;
    data?: NotificationData;
    count: number;
    created_at: Date;
    updated_at: Date;
}

export interface NotificationResponse {
    id: string;
    title: string;
    message: string;
    type: NotificationType;
    isRead: boolean;
    createdAt: string;
    referenceId?: string;
    referenceType?: NotificationReferenceType;
    data?: NotificationData;
    count?: number;
    targetUrl?: string;
}
