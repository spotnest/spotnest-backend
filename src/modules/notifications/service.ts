import { AppError } from "../../shared/errors/AppError.js";
import notificationRepository from "./repository.js";
import type {
    INotification,
    NotificationReferenceType,
    NotificationResponse,
    NotificationType,
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

const targetUrlFor = (notification: INotification): string | undefined => {
    if (notification.type === "owner_approval_request") return "/requests/owner-approvals";
    if (notification.type === "owner_approved" || notification.type === "owner_rejected") return "/owner/dashboard";
    if (notification.type === "property_status" && notification.referenceId) {
        return `/properties/${notification.referenceId.toString()}`;
    }
    return undefined;
};

const toResponse = (notification: INotification): NotificationResponse => {
    const targetUrl = targetUrlFor(notification);
    return {
        id: notification._id.toString(),
        title: notification.title,
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        createdAt: notification.created_at.toISOString(),
        ...(notification.referenceId ? { referenceId: notification.referenceId.toString() } : {}),
        ...(notification.referenceType ? { referenceType: notification.referenceType } : {}),
        ...(targetUrl ? { targetUrl } : {}),
    };
};

const createNotification = async (input: CreateNotificationInput): Promise<NotificationResponse> =>
    toResponse(await notificationRepository.create(input));

const getNotifications = async (recipient: string, query: ListNotificationsQuery) => {
    const { notifications, total } = await notificationRepository.findByRecipient(recipient, query.page, query.limit);
    return {
        notifications: notifications.map(toResponse),
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            pages: Math.ceil(total / query.limit),
        },
    };
};

const getUnreadCount = async (recipient: string): Promise<{ count: number }> => ({
    count: await notificationRepository.countUnreadByRecipient(recipient),
});

const markAsRead = async (id: string, recipient: string): Promise<NotificationResponse> => {
    const notification = await notificationRepository.markReadForRecipient(id, recipient);
    if (!notification) throw new AppError(404, "Notification not found");
    return toResponse(notification);
};

const markAllAsRead = async (recipient: string): Promise<{ message: string; modifiedCount: number }> => ({
    message: "Notifications marked as read",
    modifiedCount: await notificationRepository.markAllReadForRecipient(recipient),
});

const deleteNotification = async (id: string, recipient: string): Promise<{ message: string }> => {
    const deleted = await notificationRepository.deleteForRecipient(id, recipient);
    if (!deleted) throw new AppError(404, "Notification not found");
    return { message: "Notification deleted" };
};

export default {
    createNotification,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
};
