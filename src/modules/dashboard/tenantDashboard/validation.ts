import { z } from "zod";
import { prioritySchema } from "../../maintenance/validation.js";

/**
 * Legacy tenant-dashboard endpoint, kept for older clients. `prioritySchema`
 * canonicalises the priority names this module used before the maintenance
 * module owned the collection ("medium", "urgent") as well as any casing of
 * the canonical names. Category stays free text here and is mapped onto the
 * canonical enum in the service.
 */
export const createMaintenanceSchema = z.object({
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().min(10).max(3000),
    priority: prioritySchema.optional(),
    category: z.string().trim().min(1).max(100).optional(),
});
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
