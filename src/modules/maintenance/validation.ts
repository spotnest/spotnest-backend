import { z } from "zod";
import {
    MAINTENANCE_CATEGORIES,
    MAINTENANCE_PRIORITIES,
    MAINTENANCE_STATUSES,
    normalizeCategory,
    normalizePriority,
    normalizeStatus,
} from "./type.js";

/**
 * Clients have sent priorities in assorted casings ("normal", "NORMAL") and,
 * from the older tenant-dashboard endpoint, the legacy names "medium" and
 * "urgent". Canonicalise before the enum check; anything unrecognised is
 * passed through untouched so the enum error names the accepted values.
 */
const toCanonicalPriority = (value: unknown) =>
    typeof value === "string" ? normalizePriority(value) ?? value : value;

const toCanonicalStatus = (value: unknown) =>
    typeof value === "string" ? normalizeStatus(value) ?? value : value;

const toCanonicalCategory = (value: unknown) =>
    typeof value === "string" ? normalizeCategory(value) ?? value : value;

export const prioritySchema = z.preprocess(toCanonicalPriority, z.enum(MAINTENANCE_PRIORITIES));
export const statusSchema = z.preprocess(toCanonicalStatus, z.enum(MAINTENANCE_STATUSES));
export const categorySchema = z.preprocess(toCanonicalCategory, z.enum(MAINTENANCE_CATEGORIES));

/**
 * List filters accept "ALL" (the frontend's "no filter" sentinel) alongside a
 * canonical enum value. Normalising here keeps a lowercase query string from
 * silently matching nothing in Mongo.
 */
const filterSchema = <T extends readonly [string, ...string[]]>(
    values: T,
    normalize: (value: unknown) => unknown
) => z.preprocess(normalize, z.union([z.literal("ALL"), z.enum(values)])).optional();

export const createMaintenanceSchema = z.object({
    propertyId: z.string().optional(),
    title: z.string().min(3, "Title must be at least 3 characters").max(150, "Title cannot exceed 150 characters"),
    description: z.string().min(5, "Description must be at least 5 characters").max(3000, "Description cannot exceed 3000 characters"),
    category: categorySchema,
    priority: prioritySchema,
    preferredVisitDate: z.string().optional(),
    tenantNotes: z.string().max(1000).optional(),
});

export const updateStatusSchema = z.object({
    status: statusSchema,
    rejectionReason: z.string().max(3000).optional(),
    scheduledDate: z.string().optional(),
    resolutionNote: z.string().max(3000).optional(),
    note: z.string().max(1000).optional(),
});

export const listMaintenanceQuerySchema = z.object({
    status: filterSchema(MAINTENANCE_STATUSES, toCanonicalStatus),
    priority: filterSchema(MAINTENANCE_PRIORITIES, toCanonicalPriority),
    category: filterSchema(MAINTENANCE_CATEGORIES, toCanonicalCategory),
    propertyId: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});

export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListMaintenanceQuery = z.infer<typeof listMaintenanceQuerySchema>;
