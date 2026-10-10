import mongoose from "mongoose";
import type { QueryFilter, UpdateQuery } from "mongoose";
import type { NotificationReferenceType, INotification, NotificationType } from "./type.js";
import Notification from "./model.js";
import { UserRole } from "../auth/type.js";
import type { NotificationData } from "./type.js";

export interface CreateNotificationData {
    recipient: string;
    title: string;
    message: string;
    type: NotificationType;
    referenceId?: string;
    referenceType?: NotificationReferenceType;
    data?: NotificationData;
    dedupeKey?: string;
}

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

/**
 * Persists a notification. Returns `null` when a notification with the same
 * recipient + dedupeKey already exists, i.e. the triggering event was retried.
 */
const create = async (data: CreateNotificationData): Promise<INotification | null> => {
    try {
        return await Notification.create(data);
    } catch (error) {
        if (data.dedupeKey && isDuplicateKeyError(error)) return null;
        throw error;
    }
};

const upsertUnreadChatMessage = async (data: {
    recipient: string;
    title: string;
    message: string;
    notificationData: NotificationData & { conversationId: string };
}): Promise<INotification> => {
    const filter: QueryFilter<INotification> = {
        recipient: data.recipient,
        type: "chat_message",
        isRead: false,
        "data.conversationId": data.notificationData.conversationId,
    };
    const update: UpdateQuery<INotification> = {
        $set: {
            title: data.title,
            message: data.message,
            created_at: new Date(),
            referenceId: data.notificationData.conversationId,
            referenceType: "conversation",
            data: data.notificationData,
        },
        $setOnInsert: { recipient: data.recipient, type: "chat_message", isRead: false },
        $inc: { count: 1 },
    };
    try {
        await Notification.updateOne(filter, update, { upsert: true, setDefaultsOnInsert: false });
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        await Notification.updateOne(filter, update);
    }
    const notification = await Notification.findOne(filter);
    if (!notification) throw new Error("Unable to load chat notification after upsert");
    return notification;
};

const markChatMessageRead = async (recipient: string, conversationId: string): Promise<number> => {
    const result = await Notification.updateMany(
        {
            recipient,
            type: "chat_message",
            isRead: false,
            $or: [
                { "data.conversationId": conversationId },
                { referenceId: new mongoose.Types.ObjectId(conversationId) },
            ],
        },
        { $set: { isRead: true } },
    );
    return result.modifiedCount;
};

// These event types are addressed to specific platform roles. Keep them out of
// other roles' feeds even if legacy or incorrectly assigned rows exist.
const hiddenTypesByRole: Partial<Record<UserRole, NotificationType[]>> = {
    [UserRole.TENANT]: [
        "owner_approval_request",
        "owner_approved",
        "owner_rejected",
        "property_status",
        "rental_request",
    ],
    [UserRole.OWNER]: ["owner_approval_request", "rental_approved", "rental_rejected"],
};

export const isVisibleToRole = (type: NotificationType, role: UserRole): boolean =>
    !(hiddenTypesByRole[role] ?? []).includes(type);

const recipientFilter = (recipient: string, role: UserRole) => {
    const hiddenTypes = hiddenTypesByRole[role];
    return {
        recipient,
        ...(hiddenTypes?.length ? { type: { $nin: hiddenTypes } } : {}),
    };
};

const findByRecipient = async (
    recipient: string,
    role: UserRole,
    page: number,
    limit: number,
): Promise<{ notifications: INotification[]; total: number }> => {
    const skip = (page - 1) * limit;
    const filter = recipientFilter(recipient, role);
    const [notifications, total] = await Promise.all([
        Notification.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
        Notification.countDocuments(filter),
    ]);

    return { notifications, total };
};

const countUnreadByRecipient = async (recipient: string, role: UserRole): Promise<number> =>
    Notification.countDocuments({ ...recipientFilter(recipient, role), isRead: false });

const markReadForRecipient = async (id: string, recipient: string, role: UserRole): Promise<INotification | null> =>
    Notification.findOneAndUpdate(
        { _id: id, ...recipientFilter(recipient, role) },
        { $set: { isRead: true } },
        { returnDocument: "after" },
    );

const markAllReadForRecipient = async (recipient: string, role: UserRole): Promise<number> => {
    const result = await Notification.updateMany(
        { ...recipientFilter(recipient, role), isRead: false },
        { $set: { isRead: true } },
    );
    return result.modifiedCount;
};

const deleteForRecipient = async (id: string, recipient: string, role: UserRole): Promise<boolean> => {
    const result = await Notification.deleteOne({ _id: id, ...recipientFilter(recipient, role) });
    return result.deletedCount === 1;
};

export default {
    create,
    upsertUnreadChatMessage,
    markChatMessageRead,
    findByRecipient,
    countUnreadByRecipient,
    markReadForRecipient,
    markAllReadForRecipient,
    deleteForRecipient,
};
