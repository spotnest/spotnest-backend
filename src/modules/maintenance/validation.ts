import { z } from "zod";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from "./type.js";

export const createMaintenanceSchema = z.object({
    propertyId: z.string().optional(),
    title: z.string().min(3, "Title must be at least 3 characters").max(150, "Title cannot exceed 150 characters"),
    description: z.string().min(5, "Description must be at least 5 characters").max(3000, "Description cannot exceed 3000 characters"),
    category: z.enum(MAINTENANCE_CATEGORIES),
    priority: z.enum(MAINTENANCE_PRIORITIES),
    preferredVisitDate: z.string().optional(),
    tenantNotes: z.string().max(1000).optional(),
});

export const updateStatusSchema = z.object({
    status: z.enum(MAINTENANCE_STATUSES),
    rejectionReason: z.string().max(3000).optional(),
    scheduledDate: z.string().optional(),
    resolutionNote: z.string().max(3000).optional(),
    note: z.string().max(1000).optional(),
});

export const listMaintenanceQuerySchema = z.object({
    status: z.string().optional(),
    priority: z.string().optional(),
    category: z.string().optional(),
    propertyId: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});

export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListMaintenanceQuery = z.infer<typeof listMaintenanceQuerySchema>;
