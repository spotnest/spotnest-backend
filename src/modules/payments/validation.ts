import { z } from "zod";

export const createAdvanceOrderSchema = z.object({
    bookingId: z.string().min(1, "bookingId is required"),
});

export const createMonthlyRentOrderSchema = z.object({
    bookingId: z.string().min(1, "bookingId is required"),
    billingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "billingMonth must use YYYY-MM"),
});

export const verifyPaymentSchema = z.object({
    bookingId: z.string().min(1, "bookingId is required"),
    type: z.enum(["ADVANCE", "MONTHLY_RENT"]),
    billingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    razorpay_order_id: z.string().min(1, "razorpay_order_id is required"),
    razorpay_payment_id: z.string().min(1, "razorpay_payment_id is required"),
    razorpay_signature: z.string().min(1, "razorpay_signature is required"),
});

export type CreateAdvanceOrderInput = z.infer<typeof createAdvanceOrderSchema>;
export type CreateMonthlyRentOrderInput = z.infer<typeof createMonthlyRentOrderSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
