import { z } from "zod";

export const visitIdSchema = z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid visit id");

export const propertyIdSchema = z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid property id");

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createVisitSchema = z.object({
    propertyId: propertyIdSchema,

    requestedDate: z
        .string()
        .regex(
            dateRegex,
            "requestedDate must be in YYYY-MM-DD format"
        ),

    requestedTime: z
        .string()
        .regex(
            timeRegex,
            "requestedTime must be in HH:mm format"
        ),

    message: z
        .string()
        .trim()
        .max(1000, "Message cannot exceed 1000 characters")
        .optional(),
});

export type CreateVisitInput = z.infer<typeof createVisitSchema>;