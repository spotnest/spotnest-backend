import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const createConversationSchema = z.object({
    propertyId: objectIdSchema,
    tenantId: objectIdSchema.optional(),
});

export const conversationParamsSchema = z.object({ conversationId: objectIdSchema });

export const listMessagesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const sendMessageSchema = z.object({
    message: z.string().trim().min(1, "Message cannot be empty").max(2_000),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
