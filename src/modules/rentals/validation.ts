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
    acceptedTerms: z.literal(true, {
        error: "You must accept the rental terms and conditions",
    }),
    note: z.string().max(500).optional(),
});


export const confirmAgreementSchema = z.object({
    note: z.string().max(500).optional(),
});

export const terminateRentalSchema = z.object({
    reason: z.string().max(500).optional(),
});


export const updateOwnerRentalTermsSchema = z.object({
    terms: z
        .string()
        .trim()
        .min(20, "Rental terms must contain at least 20 characters")
        .max(10000, "Rental terms cannot exceed 10000 characters"),
});

export type UpdateOwnerRentalTermsInput = z.infer<typeof updateOwnerRentalTermsSchema>;

export type SetRentSplitInput = z.infer<typeof setRentSplitSchema>;
export type AcceptAgreementInput = z.infer<typeof acceptAgreementSchema>;
export type ConfirmAgreementInput = z.infer<typeof confirmAgreementSchema>;
export type TerminateRentalInput = z.infer<typeof terminateRentalSchema>;
