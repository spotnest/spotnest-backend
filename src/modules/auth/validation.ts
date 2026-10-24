import { z } from "zod";

export const signupSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(100),
    email: z.string().email("Invalid email format").max(150),
    phone: z.string().min(10).max(20).optional(),
    password: z.string().min(8, "Password must be at least 8 characters").max(255),
    image: z.string().url("Invalid image URL").optional(),
    // NEW — "admin" is never client-requestable
    role: z.enum(["user", "owner"]).default("user"),
});

export const loginSchema = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, "Refresh token is required"),
});

export const verifyEmailSchema = z.object({
    email: z.string().email("Invalid email format"),
    otp: z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
});

export const resendVerificationSchema = z.object({
    email: z.string().email("Invalid email format"),
});

export const forgotPasswordSchema = z.object({
    email: z.string().email("Invalid email format"),
});

export const resetPasswordSchema = z.object({
    email: z.string().email("Invalid email format"),
    otp: z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
    newPassword: z.string().min(8, "Password must be at least 8 characters").max(255),
});

export const updateProfileSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    phone: z.string().min(10).max(20).or(z.literal("")).optional(),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6).max(255),
    confirmPassword: z.string().min(6).max(255),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

export const updateLocationSchema = z.object({
    locationName: z.string().min(2, "Enter a place name").max(200),
});
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const rejectVerificationSchema = z.object({
    reason: z.string().min(1, "Rejection reason is required").max(500),
});
export const updateOwnerRentalTermsSchema = z.object({
    terms: z
        .string()
        .trim()
        .min(20, "Rental terms must contain at least 20 characters")
        .max(10000, "Rental terms cannot exceed 10000 characters"),
});

export const adminUpdateUserSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    email: z.string().email().max(150).optional(),
    phone: z.string().min(10).max(20).or(z.literal("")).optional(),
    role: z.enum(["user", "owner", "tenant", "admin"]).optional(),
    status: z.enum(["active", "inactive", "suspended", "blocked"]).optional(),
    isVerified: z.boolean().optional(),
    verificationStatus: z.enum(["unsubmitted", "pending", "approved", "rejected"]).optional(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const adminListUsersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    role: z.enum(["user", "owner", "tenant", "admin"]).optional(),
    status: z.enum(["active", "inactive", "suspended", "blocked"]).optional(),
    verificationStatus: z.enum(["unsubmitted", "pending", "approved", "rejected"]).optional(),
    search: z.string().optional(),
});
export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;

export type UpdateOwnerRentalTermsInput = z.infer< typeof updateOwnerRentalTermsSchema>;
export type RejectVerificationInput = z.infer<typeof rejectVerificationSchema>

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

