import { z } from "zod";

export const createBookingSchema = z.object({
    propertyId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid property id"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    notes: z.string().max(500).optional(),
});

export const reviewBookingSchema = z.object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    decisionNote: z.string().trim().max(500).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ReviewBookingInput = z.infer<typeof reviewBookingSchema>;
