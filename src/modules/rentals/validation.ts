import { z } from "zod";

export const occupantItemSchema = z.object({
    tenantEmail: z.string().email().optional(),
    tenantId: z.string().optional(),
    rentAmount: z.number().min(0).optional(),
    securityDepositShare: z.number().min(0).optional(),
});

export const setRentSplitSchema = z.object({
    splitMode: z.enum(["EQUAL", "CUSTOM"]),
    occupants: z.array(occupantItemSchema).min(1, "At least one occupant is required"),
});

export const acceptAgreementSchema = z.object({
    note: z.string().max(500).optional(),
});

export const confirmAgreementSchema = z.object({
    note: z.string().max(500).optional(),
});

export const terminateRentalSchema = z.object({
    reason: z.string().max(500).optional(),
});

export type SetRentSplitInput = z.infer<typeof setRentSplitSchema>;
export type AcceptAgreementInput = z.infer<typeof acceptAgreementSchema>;
export type ConfirmAgreementInput = z.infer<typeof confirmAgreementSchema>;
export type TerminateRentalInput = z.infer<typeof terminateRentalSchema>;
