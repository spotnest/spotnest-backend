import { z } from "zod";

export const visitIdSchema = z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid visit id");

export const propertyIdSchema = z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid property id");

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const visitDateSchema = z
    .string()
    .regex(
        dateRegex,
        "Date must be in YYYY-MM-DD format"
    );

const visitTimeSchema = z
    .string()
    .regex(
        timeRegex,
        "Time must be in HH:mm format"
    );

export const createVisitSchema = z.object({
    propertyId: propertyIdSchema,

    requestedDate: visitDateSchema,

    requestedTime: visitTimeSchema,

    message: z
        .string()
        .trim()
        .max(
            1000,
            "Message cannot exceed 1000 characters"
        )
        .optional(),
});

export const acceptVisitSchema = z.object({
    scheduledDate: visitDateSchema,

    scheduledTime: visitTimeSchema,
});

export const rejectVisitSchema = z.object({
    rejectionReason: z
        .string()
        .trim()
        .min(
            1,
            "Rejection reason is required"
        )
        .max(
            1000,
            "Rejection reason cannot exceed 1000 characters"
        ),
});

export const rescheduleVisitSchema = z.object({
    scheduledDate: visitDateSchema,

    scheduledTime: visitTimeSchema,

    rescheduleReason: z
        .string()
        .trim()
        .min(
            1,
            "Reschedule reason is required"
        )
        .max(
            1000,
            "Reschedule reason cannot exceed 1000 characters"
        ),
});

export type CreateVisitInput =
    z.infer<typeof createVisitSchema>;

export type AcceptVisitInput =
    z.infer<typeof acceptVisitSchema>;

export type RejectVisitInput =
    z.infer<typeof rejectVisitSchema>;

export type RescheduleVisitInput =
    z.infer<typeof rescheduleVisitSchema>;