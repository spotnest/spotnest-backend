
import { AppError } from "../../shared/errors/AppError.js";
import {
    emitNotification,
    emitNotificationRead,
} from "../../shared/socket/index.js";
import { UserRole } from "../auth/type.js";
import authRepository from "../auth/repository.js";
import notificationRepository, {
    isVisibleToRole,
} from "./repository.js";
import type {
    INotification,
    NotificationReferenceType,
    NotificationResponse,
    NotificationType,
    NotificationData,
} from "./type.js";
import type { ListNotificationsQuery } from "./validation.js";

export interface CreateNotificationInput {
    recipient: string;
    title: string;
    message: string;
    type: NotificationType;
    referenceId?: string;
    referenceType?: NotificationReferenceType;
    data?: NotificationData;
    /** Stable key derived from the event to prevent duplicate notifications. */
    dedupeKey?: string;
}

const PAYMENT_TYPES: NotificationType[] = [
    "payment_success",
    "payment_failed",
    "rent_due",
];

const paymentsPathFor = (role?: UserRole): string | undefined => {
    if (role === UserRole.OWNER) return "/owner/rentals";
    if (role === UserRole.TENANT) return "/tenant/dashboard/payments";
    if (role === UserRole.USER) return "/bookings";
    return undefined;
};

const rentalPathFor = (role?: UserRole): string | undefined => {
    if (role === UserRole.OWNER) return "/owner/rentals";
    if (role === UserRole.TENANT) return "/tenant/dashboard/rental";
    if (role === UserRole.USER) return "/bookings";
    return undefined;
};

const targetUrlFor = (
    notification: INotification,
    role?: UserRole,
): string | undefined => {
    const { type, referenceType, referenceId, data } = notification;

    // Visit requests: owners manage requests; requesters view the property.
    if (referenceType === "visit" && referenceId) {
        if (role === UserRole.OWNER) {
            return `/owner/requests?visitId=${referenceId.toString()}`;
        }

        if (data?.propertyId) {
            return `/properties/${data.propertyId}`;
        }
    }

    if (type === "rental_request") {
        return "/bookings?tab=requests";
    }

    if (type === "owner_approval_request") {
        return "/requests/owner-approvals";
    }

    if (type === "owner_approved" || type === "owner_rejected") {
        return "/owner/dashboard";
    }

    if (PAYMENT_TYPES.includes(type)) {
        return paymentsPathFor(role);
    }

    if (type === "rental_status" || referenceType === "rental") {
        return rentalPathFor(role);
    }

    if (
        (type === "rental_approved" || type === "rental_rejected") &&
        referenceId
    ) {
        if (referenceType === "booking") {
            return `/bookings?bookingId=${referenceId.toString()}`;
        }

        return rentalPathFor(role);
    }

    if (type === "property_status" && referenceId) {
        if (role === UserRole.OWNER) {
            return "/owner/properties";
        }

        return `/properties/${referenceId.toString()}`;
    }

    if (
        type.startsWith("maintenance_") ||
        referenceType === "maintenance"
    ) {
        if (role === UserRole.OWNER) {
            return "/owner/dashboard/maintenance";
        }

        if (role === UserRole.TENANT) {
            return "/tenant/dashboard/maintenance";
        }
    }

    // Support legacy payment notifications stored as system + booking.
    if (type === "system" && referenceType === "booking") {
        return paymentsPathFor(role);
    }

    if (type === "chat_message") {
        const conversationId =
            data?.conversationId ?? referenceId?.toString();

        if (!conversationId) return undefined;

        if (role === UserRole.USER) {
            return `/messages?conversationId=${conversationId}`;
        }

        if (role === UserRole.TENANT || role === UserRole.OWNER) {
            return `/${role}/dashboard/chat?conversationId=${conversationId}`;
        }
    }

    return undefined;
};

const toResponse = (
    notification: INotification,
    role?: UserRole,
): NotificationResponse => {
    const targetUrl = targetUrlFor(notification, role);

    return {
        id: notification._id.toString(),
        title: notification.title,
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        createdAt: notification.created_at.toISOString(),
        ...(notification.referenceId
            ? { referenceId: notification.referenceId.toString() }
            : {}),
        ...(notification.referenceType
            ? { referenceType: notification.referenceType }
            : {}),
        ...(notification.data ? { data: notification.data } : {}),
        ...(notification.count > 1 ? { count: notification.count } : {}),
        ...(targetUrl ? { targetUrl } : {}),
    };
};

/**
 * Persists a notification and, once the write succeeds, pushes it to the
 * recipient's private socket room.
 *
 * Returns null when the notification is a duplicate (same dedupeKey).
 * Persistence errors are thrown; realtime delivery errors are not allowed
 * to turn a successful database write into a failed operation.
 */
const createNotification = async (
    input: CreateNotificationInput,
): Promise<NotificationResponse | null> => {
    const notification = await notificationRepository.create(input);

    if (!notification) return null;

    let role: UserRole | undefined;

    try {
        role = (await authRepository.findById(input.recipient))?.role;
    } catch (error) {
        console.error(
            "[NOTIFICATION_ROLE_LOOKUP_FAILED]",
            error instanceof Error ? error.stack : error,
        );
    }

    const response = toResponse(notification, role);

    // Keep socket delivery consistent with the REST notification feed.
    if (!role || isVisibleToRole(notification.type, role)) {
        try {
            emitNotification(input.recipient, response);
        } catch (error) {
            console.error(
                "[NOTIFICATION_SOCKET_EMIT_FAILED]",
                error instanceof Error ? error.stack : error,
            );
        }
    }

    return response;
};

/**
 * Best-effort notification for side effects of operations that have already
 * succeeded. Notification failure must not undo an approval or payment.
 */
const notify = async (
    input: CreateNotificationInput,
): Promise<NotificationResponse | null> => {
    try {
        return await createNotification(input);
    } catch (error) {
        console.error(
            "[NOTIFICATION_FAILED]",
            input.type,
            error instanceof Error ? error.stack : error,
        );

        return null;
    }
};

const createOrUpdateChatMessageNotification = async (input: {
    recipient: string;
    title: string;
    message: string;
    data: NotificationData & { conversationId: string };
}): Promise<NotificationResponse> => {
    const notification =
        await notificationRepository.upsertUnreadChatMessage({
            recipient: input.recipient,
            title: input.title,
            message: input.message,
            notificationData: input.data,
        });

    const recipient = await authRepository.findById(input.recipient);

    return toResponse(notification, recipient?.role);
};

const markChatMessageRead = async (
    recipient: string,
    conversationId: string,
): Promise<number> =>
    notificationRepository.markChatMessageRead(
        recipient,
        conversationId,
    );

const getNotifications = async (
    recipient: string,
    role: UserRole,
    query: ListNotificationsQuery,
) => {
    const { notifications, total } =
        await notificationRepository.findByRecipient(
            recipient,
            role,
            query.page,
            query.limit,
        );

    return {
        notifications: notifications.map((notification) =>
            toResponse(notification, role),
        ),
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            pages: Math.ceil(total / query.limit),
        },
    };
};

const getUnreadCount = async (
    recipient: string,
    role: UserRole,
): Promise<{ count: number }> => ({
    count: await notificationRepository.countUnreadByRecipient(
        recipient,
        role,
    ),
});

/** Synchronizes notification read state and unread badges across devices. */
const broadcastReadState = async (
    recipient: string,
    role: UserRole,
    change: {
        notificationId?: string;
        conversationId?: string;
        all?: boolean;
    },
): Promise<void> => {
    try {
        const { count } = await getUnreadCount(recipient, role);

        emitNotificationRead(recipient, {
            ...change,
            unreadCount: count,
        });
    } catch (error) {
        console.error(
            "[NOTIFICATION_READ_SYNC_FAILED]",
            error instanceof Error ? error.stack : error,
        );
    }
};

const markAsRead = async (
    id: string,
    recipient: string,
    role: UserRole,
): Promise<NotificationResponse> => {
    const notification =
        await notificationRepository.markReadForRecipient(
            id,
            recipient,
            role,
        );

    if (!notification) {
        throw new AppError(404, "Notification not found");
    }

    await broadcastReadState(recipient, role, {
        notificationId: id,
    });

    return toResponse(notification, role);
};

const markAllAsRead = async (
    recipient: string,
    role: UserRole,
): Promise<{ message: string; modifiedCount: number }> => {
    const modifiedCount =
        await notificationRepository.markAllReadForRecipient(
            recipient,
            role,
        );

    await broadcastReadState(recipient, role, { all: true });

    return {
        message: "Notifications marked as read",
        modifiedCount,
    };
};

const deleteNotification = async (
    id: string,
    recipient: string,
    role: UserRole,
): Promise<{ message: string }> => {
    const deleted =
        await notificationRepository.deleteForRecipient(
            id,
            recipient,
            role,
        );

    if (!deleted) {
        throw new AppError(404, "Notification not found");
    }

    return { message: "Notification deleted" };
};

export default {
    createNotification,
    notify,
    createOrUpdateChatMessageNotification,
    markChatMessageRead,
    broadcastReadState,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
};
