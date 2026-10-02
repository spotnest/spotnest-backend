import mongoose from "mongoose";
import Conversation from "./conversationModel.js";
import Message from "./messageModel.js";
import type { IConversation, IMessage, PopulatedConversation } from "./type.js";

const createOrFindConversation = async (propertyId: string, tenantId: string, ownerId: string): Promise<IConversation> => {
    console.log("[chat] conversation participants", { propertyId, tenantId, ownerId });
    try {
        return (await Conversation.findOneAndUpdate(
            { propertyId, tenantId, ownerId },
            { $setOnInsert: { participants: [tenantId, ownerId] } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ))!;
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        const existing = await Conversation.findOne({ propertyId, tenantId, ownerId });
        if (!existing) throw error;
        return existing;
    }
};

const findByParticipant = async (userId: string): Promise<PopulatedConversation[]> => {
    const result = await Conversation.find({
        $or: [{ participants: userId }, { tenantId: userId }, { ownerId: userId }],
    })
        .populate("propertyId", "title images")
        .populate("tenantId", "name image")
        .populate("ownerId", "name image")
        .sort({ updated_at: -1 })
        .lean();
    return result as unknown as PopulatedConversation[];
};

const findPopulatedById = async (id: string): Promise<PopulatedConversation | null> => {
    const result = await Conversation.findById(id)
        .populate("propertyId", "title images")
        .populate("tenantId", "name image")
        .populate("ownerId", "name image")
        .lean();
    return (result as unknown as PopulatedConversation | null);
};

const findById = async (id: string): Promise<IConversation | null> => Conversation.findById(id);

const getUnreadCounts = async (conversationIds: string[], recipientId: string): Promise<Map<string, number>> => {
    if (conversationIds.length === 0) return new Map();
    const rows = await Message.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        {
            $match: {
                conversationId: { $in: conversationIds.map((id) => new mongoose.Types.ObjectId(id)) },
                recipientId: new mongoose.Types.ObjectId(recipientId),
                isRead: false,
            },
        },
        { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [row._id.toString(), row.count]));
};

const listMessages = async (conversationId: string, limit: number): Promise<IMessage[]> => {
    const results = await Message.find({ conversationId }).sort({ created_at: -1 }).limit(limit).lean();
    return results.reverse() as IMessage[];
};

const createMessage = async (data: {
    conversationId: string;
    senderId: string;
    recipientId: string;
    message: string;
}): Promise<IMessage> => Message.create(data);

const updateLastMessage = async (conversationId: string, message: string, sentAt: Date): Promise<void> => {
    await Conversation.updateOne({ _id: conversationId }, { $set: { lastMessage: message, lastMessageAt: sentAt } });
};

const markMessagesRead = async (conversationId: string, recipientId: string): Promise<number> => {
    const result = await Message.updateMany({ conversationId, recipientId, isRead: false }, { $set: { isRead: true } });
    return result.modifiedCount;
};

export default {
    createOrFindConversation,
    findByParticipant,
    findPopulatedById,
    findById,
    getUnreadCounts,
    listMessages,
    createMessage,
    updateLastMessage,
    markMessagesRead,
};
