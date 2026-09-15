import { z } from "zod";

export const signupSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(100),
    email: z.string().email("Invalid email format").max(150),
    phone: z.string().min(10).max(20).optional(),
    password: z.string().min(6, "Password must be at least 6 characters").max(255),
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
    newPassword: z.string().min(6, "Password must be at least 6 characters").max(255),
});

export const rejectVerificationSchema = z.object({
    reason: z.string().min(1, "Rejection reason is required").max(500),
});
export type RejectVerificationInput = z.infer<typeof rejectVerificationSchema>

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
