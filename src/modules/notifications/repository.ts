import type { NotificationReferenceType, INotification, NotificationType } from "./type.js";
import Notification from "./model.js";
import { UserRole } from "../auth/type.js";

export interface CreateNotificationData {
    recipient: string;
    title: string;
    message: string;
    type: NotificationType;
    referenceId?: string;
    referenceType?: NotificationReferenceType;
}

const create = async (data: CreateNotificationData): Promise<INotification> => Notification.create(data);

// These event types are addressed to specific platform roles. Keep them out of
// other roles' feeds even if legacy or incorrectly assigned rows exist.
const hiddenTypesByRole: Partial<Record<UserRole, NotificationType[]>> = {
    [UserRole.TENANT]: [
        "owner_approval_request",
        "owner_approved",
        "owner_rejected",
        "property_status",
    ],
    [UserRole.OWNER]: ["owner_approval_request"],
};

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
    findByRecipient,
    countUnreadByRecipient,
    markReadForRecipient,
    markAllReadForRecipient,
    deleteForRecipient,
};
