import type { NotificationResponse } from "../../modules/notifications/type.js";

/**
 * Socket.IO event contract shared by every server-side emitter.
 *
 * Event names follow the existing `<domain>:<action>` convention already used
 * by chat (`conversation:join`, `notification:new`). `new_message` predates
 * this convention and is kept unchanged so the working chat client keeps
 * working.
 *
 * Payloads never carry tokens, payment gateway identifiers, contact details
 * or other personal data. Dashboard events only say *what kind* of data
 * changed; clients refetch the authoritative numbers over the authenticated
 * REST APIs.
 */
export const SocketEvents = {
    NOTIFICATION_NEW: "notification:new",
    NOTIFICATION_READ: "notification:read",
    DASHBOARD_UPDATE: "dashboard:update",
    SESSION_EXPIRED: "session:expired",
    CHAT_NEW_MESSAGE: "new_message",
    CONVERSATION_JOIN: "conversation:join",
    CONVERSATION_LEAVE: "conversation:leave",
} as const;

export type NotificationNewPayload = NotificationResponse;

export interface NotificationReadPayload {
    /** Present when a single notification was marked as read. */
    notificationId?: string;
    /** Present when chat notifications for a conversation were marked as read. */
    conversationId?: string;
    /** True when every notification of the user was marked as read. */
    all?: boolean;
    /** Authoritative unread count after the change, for the badge. */
    unreadCount: number;
}

export type DashboardScope =
    | "booking"
    | "rental"
    | "payment"
    | "property"
    | "user"
    | "maintenance";

export type DashboardAction =
    | "created"
    | "approved"
    | "rejected"
    | "status_changed"
    | "agreement_accepted"
    | "agreement_confirmed"
    | "split_updated"
    | "terminated"
    | "paid"
    | "failed"
    | "overdue"
    | "role_changed"
    | "verification_changed";

export interface DashboardUpdatePayload {
    scope: DashboardScope;
    action: DashboardAction;
    /** Id of the changed resource, so clients can refetch a detail view. */
    entityId?: string;
    occurredAt: string;
}

export interface SessionExpiredPayload {
    reason: "token_expired";
}

export const userRoom = (userId: string): string => `user:${userId}`;
export const ADMIN_ROOM = "role:admin";
export const conversationRoom = (conversationId: string): string => `conv:${conversationId}`;
