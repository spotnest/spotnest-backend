import { AppError } from "../../shared/errors/AppError.js";
import authRepository from "../auth/repository.js";
import { UserRole, UserStatus } from "../auth/type.js";
import propertyRepository from "../properties/repository.js";
import notificationService from "../notifications/service.js";
import chatRepository from "./repository.js";
import type { CreateConversationInput, ListMessagesQuery, SendMessageInput } from "./validation.js";
import type { ConversationResponse, IConversation, IMessage, MessageResponse, PopulatedConversation } from "./type.js";

const isRenterRole = (role: UserRole) =>
    role === UserRole.TENANT || role === UserRole.USER;

const assertChatRole = (role: UserRole) => {
    if (!isRenterRole(role) && role !== UserRole.OWNER) {
        throw new AppError(403, "Chat is available only to users, tenants and owners");
    }
};
const assertParticipant = (conversation: Pick<IConversation, "tenantId" | "ownerId">, userId: string) => {
    const tenantId = conversation.tenantId.toString();
    const ownerId = conversation.ownerId.toString();
    if (tenantId !== userId && ownerId !== userId) throw new AppError(403, "You are not a participant in this conversation");
    return { tenantId, ownerId };
};

const toConversationResponse = (
    conversation: PopulatedConversation,
    userId: string,
    unreadCount: number,
): ConversationResponse | null => {
    const property = conversation.propertyId;
    const tenant = conversation.tenantId;
    const owner = conversation.ownerId;
    if (!property || !tenant || !owner) return null;
    const isTenant = tenant._id.toString() === userId;
    const counterpart = isTenant ? owner : tenant;
    return {
        id: conversation._id.toString(),
        property: {
            id: property._id.toString(),
            title: property.title,
            ...(property.images?.[0]?.url ? { image: property.images[0].url } : {}),
        },
        counterpart: {
            id: counterpart._id.toString(),
            name: counterpart.name,
            ...(counterpart.image ? { image: counterpart.image } : {}),
            role: isTenant ? "owner" : "tenant",
        },
        ...(conversation.lastMessage ? { lastMessage: conversation.lastMessage } : {}),
        ...(conversation.lastMessageAt ? { lastMessageAt: conversation.lastMessageAt.toISOString() } : {}),
        unreadCount,
        createdAt: conversation.created_at.toISOString(),
    };
};

const toMessageResponse = (message: IMessage): MessageResponse => ({
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    recipientId: message.recipientId.toString(),
    message: message.message,
    isRead: message.isRead,
    createdAt: message.created_at.toISOString(),
});

const createOrGetConversation = async (userId: string, role: UserRole, input: CreateConversationInput): Promise<ConversationResponse> => {
    assertChatRole(role);
    const property = await propertyRepository.findById(input.propertyId);
    if (!property || property.status !== "active") throw new AppError(404, "Active property not found");

    const ownerId = property.owner.toString();
    let tenantId: string;
    if (isRenterRole(role)) {
        if (input.tenantId && input.tenantId !== userId)
            throw new AppError(403, "You cannot start a conversation for another user");
        tenantId = userId;
    } else {
        if (ownerId !== userId) throw new AppError(403, "You can only start conversations for your own property");
        if (!input.tenantId) throw new AppError(400, "tenantId is required when an owner starts a conversation");
        const tenant = await authRepository.findById(input.tenantId);
        if (!tenant || !isRenterRole(tenant.role) || tenant.status !== UserStatus.ACTIVE || tenant.isBlock) {
            throw new AppError(404, "Active user not found");
        }
        tenantId = tenant._id.toString();
    }

    const conversation = await chatRepository.createOrFindConversation(input.propertyId, tenantId, ownerId);
    const populated = await chatRepository.findPopulatedById(conversation._id.toString());
    if (!populated) throw new AppError(500, "Unable to load conversation");
    return toConversationResponse(populated, userId, 0)!;
};

const listConversations = async (userId: string, role: UserRole): Promise<ConversationResponse[]> => {
    assertChatRole(role);
    const conversations = await chatRepository.findByParticipant(userId);
    const unreadCounts = await chatRepository.getUnreadCounts(conversations.map((item) => item._id.toString()), userId);
    return conversations
        .map((conversation) => toConversationResponse(conversation, userId, unreadCounts.get(conversation._id.toString()) ?? 0))
        .filter((conversation): conversation is ConversationResponse => conversation !== null);
};

const assertConversationParticipant = async (conversationId: string, userId: string, role: UserRole) => {
    assertChatRole(role);
    const conversation = await chatRepository.findById(conversationId);
    if (!conversation) throw new AppError(404, "Conversation not found");
    const participants = assertParticipant(conversation, userId);
    return { conversation, ...participants };
};

const listMessages = async (conversationId: string, userId: string, role: UserRole, query: ListMessagesQuery): Promise<MessageResponse[]> => {
    await assertConversationParticipant(conversationId, userId, role);
    const messages = await chatRepository.listMessages(conversationId, query.limit);
    return messages.map(toMessageResponse);
};

const sendMessage = async (conversationId: string, userId: string, role: UserRole, input: SendMessageInput): Promise<MessageResponse> => {
    const { conversation, tenantId, ownerId } = await assertConversationParticipant(conversationId, userId, role);
    const recipientId = userId === tenantId ? ownerId : tenantId;
    const sentAt = new Date();
    const message = await chatRepository.createMessage({
        conversationId,
        senderId: userId,
        recipientId,
        message: input.message,
    });
    await chatRepository.updateLastMessage(conversationId, input.message, sentAt);

    try {
        await notificationService.createNotification({
            recipient: recipientId,
            title: "New chat message",
            message: input.message.slice(0, 160),
            type: "chat_message",
            referenceId: conversation._id.toString(),
            referenceType: "conversation",
        });
    } catch (error) {
        console.error("Unable to create chat notification", error);
    }

    return toMessageResponse(message);
};

const markMessagesRead = async (conversationId: string, userId: string, role: UserRole): Promise<{ modifiedCount: number }> => {
    await assertConversationParticipant(conversationId, userId, role);
    return { modifiedCount: await chatRepository.markMessagesRead(conversationId, userId) };
};

export default { createOrGetConversation, listConversations, listMessages, sendMessage, markMessagesRead };
