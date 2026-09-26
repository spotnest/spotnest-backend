import type { NotificationReferenceType, NotificationType, INotification } from "./type.js";
import Notification from "./model.js";

export interface CreateNotificationData {
    recipient: string;
    title: string;
    message: string;
    type: NotificationType;
    referenceId?: string;
    referenceType?: NotificationReferenceType;
}

const create = async (data: CreateNotificationData): Promise<INotification> => Notification.create(data);

const findByRecipient = async (
    recipient: string,
    page: number,
    limit: number,
): Promise<{ notifications: INotification[]; total: number }> => {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
        Notification.find({ recipient }).sort({ created_at: -1 }).skip(skip).limit(limit),
        Notification.countDocuments({ recipient }),
    ]);

    return { notifications, total };
};

const countUnreadByRecipient = async (recipient: string): Promise<number> =>
    Notification.countDocuments({ recipient, isRead: false });

const markReadForRecipient = async (id: string, recipient: string): Promise<INotification | null> =>
    Notification.findOneAndUpdate({ _id: id, recipient }, { $set: { isRead: true } }, { returnDocument: "after" });

const markAllReadForRecipient = async (recipient: string): Promise<number> => {
    const result = await Notification.updateMany({ recipient, isRead: false }, { $set: { isRead: true } });
    return result.modifiedCount;
};

const deleteForRecipient = async (id: string, recipient: string): Promise<boolean> => {
    const result = await Notification.deleteOne({ _id: id, recipient });
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
