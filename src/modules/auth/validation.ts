import { z } from "zod";

export const signupSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(100),
    email: z.string().email("Invalid email format").max(150),
    phone: z.string().min(10).max(20).optional(),
    password: z.string().min(6, "Password must be at least 6 characters").max(255),
    image: z.string().url("Invalid image URL").optional(),
});

export const loginSchema = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;