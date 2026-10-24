import { z } from "zod";

export const notificationIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid notification id");

export const listNotificationsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
