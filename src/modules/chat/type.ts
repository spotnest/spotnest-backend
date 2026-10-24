import type { Document, Types } from "mongoose";

export interface IConversation extends Document {
    propertyId: Types.ObjectId;
    tenantId: Types.ObjectId;
    ownerId: Types.ObjectId;
    participants: Types.ObjectId[];
    lastMessage?: string;
    lastMessageAt?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface IMessage extends Document {
    conversationId: Types.ObjectId;
    senderId: Types.ObjectId;
    recipientId: Types.ObjectId;
    message: string;
    isRead: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface PopulatedConversation {
    _id: Types.ObjectId;
    propertyId: { _id: Types.ObjectId; title: string; images: { url?: string }[] } | null;
    tenantId: { _id: Types.ObjectId; name: string; image?: string } | null;
    ownerId: { _id: Types.ObjectId; name: string; image?: string } | null;
    lastMessage?: string;
    lastMessageAt?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface ConversationResponse {
    id: string;
    property: { id: string; title: string; image?: string };
    counterpart: { id: string; name: string; image?: string; role: "owner" | "tenant" };
    lastMessage?: string;
    lastMessageAt?: string;
    unreadCount: number;
    createdAt: string;
}

export interface MessageResponse {
    id: string;
    conversationId: string;
    senderId: string;
    recipientId: string;
    message: string;
    isRead: boolean;
    createdAt: string;
}
