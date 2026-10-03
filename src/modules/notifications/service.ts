import { AppError } from "../../shared/errors/AppError.js";
import { UserRole } from "../auth/type.js";
import authRepository from "../auth/repository.js";
import notificationRepository from "./repository.js";
import type {
    INotification,
    NotificationReferenceType,
    NotificationResponse,
    NotificationType,
    NotificationData,
} from "./type.js";
import type { ListNotificationsQuery } from "./validation.js";

interface CreateNotificationInput {
    recipient: string;
    title: string;
    message: string;
    type: NotificationType;
    referenceId?: string;
    referenceType?: NotificationReferenceType;
}

const targetUrlFor = (notification: INotification, role?: UserRole): string | undefined => {
    if (notification.type === "rental_request") return "/bookings?tab=requests";
    if ((notification.type === "rental_approved" || notification.type === "rental_rejected") && notification.referenceId) {
        return `/bookings?bookingId=${notification.referenceId.toString()}`;
    }
    if (notification.type === "owner_approval_request") return "/requests/owner-approvals";
    if (notification.type === "owner_approved" || notification.type === "owner_rejected") return "/owner/dashboard";
    if (notification.type === "property_status" && notification.referenceId) {
        return `/properties/${notification.referenceId.toString()}`;
    }
    if (notification.type === "chat_message") {
        const conversationId = notification.data?.conversationId ?? notification.referenceId?.toString();
        if (!conversationId) return undefined;
        if (role === UserRole.USER) return `/messages?conversationId=${conversationId}`;
        if (role === UserRole.TENANT || role === UserRole.OWNER) {
            return `/${role}/dashboard/chat?conversationId=${conversationId}`;
        }
    }
    return undefined;
};

const toResponse = (notification: INotification, role?: UserRole): NotificationResponse => {
    const targetUrl = targetUrlFor(notification, role);
    return {
        id: notification._id.toString(),
        title: notification.title,
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        createdAt: notification.created_at.toISOString(),
        ...(notification.referenceId ? { referenceId: notification.referenceId.toString() } : {}),
        ...(notification.referenceType ? { referenceType: notification.referenceType } : {}),
        ...(notification.data ? { data: notification.data } : {}),
        ...(notification.count > 1 ? { count: notification.count } : {}),
        ...(targetUrl ? { targetUrl } : {}),
    };
};

const createNotification = async (input: CreateNotificationInput): Promise<NotificationResponse> =>
    toResponse(await notificationRepository.create(input));

const createOrUpdateChatMessageNotification = async (input: {
    recipient: string;
    title: string;
    message: string;
    data: NotificationData & { conversationId: string };
}): Promise<NotificationResponse> => {
    const notification = await notificationRepository.upsertUnreadChatMessage({
        recipient: input.recipient,
        title: input.title,
        message: input.message,
        notificationData: input.data,
    });
    const recipient = await authRepository.findById(input.recipient);
    return toResponse(notification, recipient?.role);
};

const markChatMessageRead = async (recipient: string, conversationId: string): Promise<number> =>
    notificationRepository.markChatMessageRead(recipient, conversationId);

const getNotifications = async (recipient: string, role: UserRole, query: ListNotificationsQuery) => {
    const { notifications, total } = await notificationRepository.findByRecipient(recipient, role, query.page, query.limit);
    return {
        notifications: notifications.map((notification) => toResponse(notification, role)),
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            pages: Math.ceil(total / query.limit),
        },
    };
};

const getUnreadCount = async (recipient: string, role: UserRole): Promise<{ count: number }> => ({
    count: await notificationRepository.countUnreadByRecipient(recipient, role),
});

const markAsRead = async (id: string, recipient: string, role: UserRole): Promise<NotificationResponse> => {
    const notification = await notificationRepository.markReadForRecipient(id, recipient, role);
    if (!notification) throw new AppError(404, "Notification not found");
    return toResponse(notification, role);
};

const markAllAsRead = async (recipient: string, role: UserRole): Promise<{ message: string; modifiedCount: number }> => ({
    message: "Notifications marked as read",
    modifiedCount: await notificationRepository.markAllReadForRecipient(recipient, role),
});

const deleteNotification = async (id: string, recipient: string, role: UserRole): Promise<{ message: string }> => {
    const deleted = await notificationRepository.deleteForRecipient(id, recipient, role);
    if (!deleted) throw new AppError(404, "Notification not found");
    return { message: "Notification deleted" };
};

export default {
    createNotification,
    createOrUpdateChatMessageNotification,
    markChatMessageRead,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
};
