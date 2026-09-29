import mongoose, { Schema } from "mongoose";
import type { IMessage } from "./type.js";

const messageSchema = new Schema<IMessage>(
    {
        conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
        senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        message: { type: String, required: true, trim: true, maxlength: 2_000 },
        isRead: { type: Boolean, default: false },
    },
    { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

messageSchema.index({ conversationId: 1, created_at: -1 });
messageSchema.index({ conversationId: 1, recipientId: 1, isRead: 1 });

const Message = mongoose.model<IMessage>("Message", messageSchema);
export default Message;
