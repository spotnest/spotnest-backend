import { z } from "zod";

export const createMaintenanceSchema = z.object({
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().min(10).max(3000),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    category: z.string().trim().min(1).max(100).optional(),
});
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
