import { z } from "zod";

export const settingsUpdateSchema = z.object({
    ownerApprovalRequired: z.boolean().optional(),
    emailVerificationRequired: z.boolean().optional(),
    userRegistrationEnabled: z.boolean().optional(),
    ownerRegistrationEnabled: z.boolean().optional(),
    propertyApprovalRequired: z.boolean().optional(),
    propertyListingEnabled: z.boolean().optional(),
    newOwnerRegistrationAlerts: z.boolean().optional(),
    ownerApprovalEmails: z.boolean().optional(),
    platformName: z.string().min(1).max(100).optional(),
    supportEmail: z.string().email().or(z.literal("")).optional(),
    supportPhone: z.string().max(30).optional(),
    currency: z.string().min(1).max(10).optional(),
    timezone: z.string().min(1).max(100).optional(),
    defaultPaginationLimit: z.number().int().min(1).max(50).optional(),
    maintenanceMode: z.boolean().optional(),
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
