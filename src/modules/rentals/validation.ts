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

export const createManualAgreementSchema = z.object({
    propertyId: z.string().min(1, "Property is required"),
    tenantEmail: z.string().email("Valid tenant email is required"),
    monthlyRent: z.number().positive("Monthly rent must be greater than 0"),
    securityDeposit: z.number().min(0, "Security deposit cannot be negative"),
    maintenanceFee: z.number().min(0).optional(),
    paymentFrequency: z.enum(["monthly"]).optional(),
    noticePeriodDays: z.number().int().min(1).optional(),
    leaseStart: z.string().min(1, "Lease start date is required"),
    leaseEnd: z.string().min(1, "Lease end date is required"),
    terms: z.string().trim().min(20, "Agreement terms must contain at least 20 characters").max(10000).optional(),
    autoSend: z.boolean().optional(),
});

export const updateAgreementSchema = z.object({
    terms: z.string().trim().min(20, "Agreement terms must contain at least 20 characters").max(10000).optional(),
    monthlyRent: z.number().positive().optional(),
    securityDepositShare: z.number().min(0).optional(),
    maintenanceFee: z.number().min(0).optional(),
    leaseStart: z.string().optional(),
    leaseEnd: z.string().optional(),
    noticePeriodDays: z.number().int().min(1).optional(),
    revisionNote: z.string().max(500).optional(),
});

export type UpdateOwnerRentalTermsInput = z.infer<typeof updateOwnerRentalTermsSchema>;
export type CreateManualAgreementInput = z.infer<typeof createManualAgreementSchema>;
export type UpdateAgreementInput = z.infer<typeof updateAgreementSchema>;
export type SetRentSplitInput = z.infer<typeof setRentSplitSchema>;
export type AcceptAgreementInput = z.infer<typeof acceptAgreementSchema>;
export type ConfirmAgreementInput = z.infer<typeof confirmAgreementSchema>;
export type TerminateRentalInput = z.infer<typeof terminateRentalSchema>;
