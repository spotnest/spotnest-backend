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
    role: UserRole;
    isBlock: boolean;
    permissions?: string;
    isVerified: boolean;
    status: UserStatus;
    created_at: Date;
    updated_at: Date;
}

// JWT token data
export interface JwtPayload {
    userId: string;
    email: string;
    role: UserRole;
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
}