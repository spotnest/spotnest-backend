import mongoose, { Schema } from "mongoose";
import type { IConversation } from "./type.js";

const conversationSchema = new Schema<IConversation>(
    {
        propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
        tenantId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        participants: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
        lastMessage: { type: String, maxlength: 2_000 },
        lastMessageAt: { type: Date },
    },
    { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

conversationSchema.index({ propertyId: 1, tenantId: 1, ownerId: 1 }, { unique: true });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

const Conversation = mongoose.model<IConversation>("Conversation", conversationSchema);
export default Conversation;
