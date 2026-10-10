import type { Document, Types } from "mongoose";

export const notificationTypes = [
    "owner_approval_request",
    "owner_approved",
    "owner_rejected",
    "property_status",
    "rental_request",
    "rental_approved",
    "rental_rejected",
    "rental_status",
    "payment_success",
    "payment_failed",
    "rent_due",
    "chat_message",
    "maintenance_created",
    "maintenance_accepted",
    "maintenance_rejected",
    "maintenance_scheduled",
    "maintenance_rescheduled",
    "maintenance_started",
    "maintenance_completed",
    "maintenance_cancelled",
    "maintenance_status",
    "system",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export const notificationReferenceTypes = [
    "user",
    "property",
    "conversation",
    "visit",
    "booking",
    "rental",
    "payment",
    "maintenance",
] as const;

export type NotificationReferenceType = (typeof notificationReferenceTypes)[number];

/**
 * Non-sensitive identifiers used for routing a notification click. Never put
 * gateway ids, contact details or other personal data here: this object is
 * sent to the client as-is.
 */
export interface NotificationData {
    conversationId?: string;
    propertyId?: string;
    senderId?: string;
    bookingId?: string;
    rentalId?: string;
    paymentId?: string;
    agreementId?: string;
    maintenanceId?: string;
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
    /**
     * Idempotency key. A second notification with the same recipient and key
     * is rejected by a unique index, so retried requests, duplicate webhooks
     * and repeated scheduler runs cannot create duplicates.
     */
    dedupeKey?: string;
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
