import { Document } from "mongoose";

export enum UserRole {
    USER = "user",
    ADMIN = "admin",
    OWNER = "owner",
}

export enum UserStatus {
    ACTIVE = "active",
    INACTIVE = "inactive",
    SUSPENDED = "suspended",
}

export interface IUser extends Document {
    name: string;
    email: string;
    phone?: string;
    password_hash: string;
    image?: string;
    // Profile picture
    imagePublicId?: string; // Cloudinary public_id for the current profile image, needed to delete it on replacement — select: false

    // Owner ID verification
    verificationStatus?: "unsubmitted" | "pending" | "approved" | "rejected";
    idDocumentPublicId?: string;       // sensitive — select: false
    rejectionReason?: string;
    verificationSubmittedAt?: Date;
    verificationReviewedAt?: Date;
    verificationReviewedBy?: string;   // admin's user id
    role: UserRole;
    isBlock: boolean;
    permissions?: string[];
    isVerified: boolean;
    status: UserStatus;
    otpHash?: string;
    otpExpiry?: Date;
    otpType?: "email_verify" | "password_reset";
    otpAttempts?: number;
    created_at: Date;
    updated_at: Date;
}

// JWT token data
export interface JwtPayload {
    id: string
    userId: string;
    email: string;
    role: UserRole;
    type: "access" | "refresh";
}

// response data
export interface AuthResponse {
    user: {
        id: string;
        name: string;
        email: string;
        role: UserRole;
        image?: string;
    };
    token: string;
    refreshToken: string;
}

export interface SignupPendingResponse {
    message: string;
    user: {
        id: string;
        name: string;
        email: string;
    };
}
